import { logger } from "@truffle/db/logger";
const debug = logger("db:project:migrate");

import { ContractObject } from "@truffle/contract-schema/spec";
import { toIdObject, IdObject, Process } from "@truffle/db/project/process";

import { generateNetworkId } from "./networkId";
import { generateTransactionBlocks } from "./blocks";
import { generateNetworksLoad } from "./networks";
import { generateNetworkGenealogiesLoad } from "./networkGenealogies";
import { generateContracts } from "./contracts";
import { generateContractInstancesLoad } from "./contractInstances";

export type Artifact = ContractObject & {
  networks?: {
    [networkId: string]: {
      db?: {
        network: IdObject<DataModel.Network>;
        contractInstance: IdObject<DataModel.ContractInstance>;
      };
    };
  };
};

export function* generateMigrateLoad(options: {
  // we'll need everything for this input other than what's calculated here
  network: Omit<DataModel.NetworkInput, "networkId" | "historicBlock">;
  artifacts: (ContractObject & {
    db: {
      contract: IdObject<DataModel.Contract>;
      callBytecode: IdObject<DataModel.Bytecode>;
      createBytecode: IdObject<DataModel.Bytecode>;
    };
  })[];
}): Process<{
  network: IdObject<DataModel.Network>;
  artifacts: Artifact[];
}> {
  const networkId = yield* generateNetworkId();

  const withBlocks = yield* generateTransactionBlocks({
    network: {
      ...options.network,
      networkId
    },
    artifacts: options.artifacts
  });

  // @ts-ignore
  const withNetworks = yield* generateNetworksLoad(withBlocks);

  yield* generateNetworkGenealogiesLoad(withNetworks);

  const [
    {
      db: { network }
    }
  ] = withNetworks.artifacts
    .map(({ networks }) => networks[networkId])
    .filter(networkObject => networkObject && networkObject.block)
    .sort((a, b) => b.block.height - a.block.height); // descending

  const withContracts = yield* generateContracts(withNetworks);

  const { artifacts } = yield* generateContractInstancesLoad(
    // @ts-ignore
    withContracts
  );

  return {
    // @ts-ignore
    network: toIdObject(network),
    artifacts: artifacts.map(artifact => ({
      ...artifact,
      networks: artifact.networks
    }))
  };
}

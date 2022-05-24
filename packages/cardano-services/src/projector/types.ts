/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-use-before-define */
import { Cardano } from '@cardano-sdk/core';
import { PointOrOrigin, TipOrOrigin } from '@cardano-ogmios/schema';

export interface RollBackwardContextBase {
  point: PointOrOrigin;
  tip: TipOrOrigin;
}

export interface BlockBase {
  hash: Cardano.BlockId;
  height: Cardano.BlockNo;
  slotNo: Cardano.Slot;
  previousBlockHash: Cardano.BlockId;
}

/**
 * Wrap ogmios block to not have to deal with different era formats within handlers
 */
export interface RollForwardContextBase {
  block: BlockBase & { transactions: Cardano.TxAlonzo[] };
}

/**
 * TODO: Current interface assumes we can use 'commit' to also schedule any processing jobs, e.g. pushing task to queue.
 * Need to carefully think about this because the scheduled job might become invalid due to:
 * - handler commit might not actually write data to the underlying database (write to a transaction object instead) so:
 *   - it can fail after this handler is processed
 *   - if the job expects block data to be written in the database, it might be querying too early (race)
 * - rollback could happen after scheduling the job
 * Some options to consider: add error(), add postCommit()
 */
export interface BlockEventHandler<TPrepareContext, TCommitContext, TPrepareResult = {}> {
  /**
   * Process the block (e.g. fetch any additional data from the db or from off-chain sources)
   */
  prepare?: (ctx: TPrepareContext) => Promise<TPrepareResult>;
  /**
   * Commit the block (e.g. write to database)
   */
  commit: (ctx: TCommitContext, prepareResult: TPrepareResult) => Promise<void>;
}

// Extract generic arguments
type PrepareContext<THandler> = THandler extends BlockEventHandler<infer TPrepareContext, any, any>
  ? TPrepareContext
  : never;
type PrepareResult<THandler> = THandler extends BlockEventHandler<any, any, infer TPrepareResult>
  ? TPrepareResult
  : never;
type CommitContext<THandler> = THandler extends BlockEventHandler<any, infer TCommitContext, any>
  ? TCommitContext
  : never;
type RollForwardHandler<TBlockHandler> = TBlockHandler extends BlockHandler<infer TRollForwardHandler, any>
  ? TRollForwardHandler
  : never;
type RollBackwardHandler<TBlockHandler> = TBlockHandler extends BlockHandler<any, infer TRollBackwardHandler>
  ? TRollBackwardHandler
  : never;

/**
 * Block handler that receives PrepareResult of the parent handler
 */
export type ChildHandler<
  TBlockHandler extends BlockHandler<unknown, unknown>,
  TRollForwardPrepareResultExt = {},
  TRollBackwardPrepareResultExt = {},
  TRollForwardHandler = RollForwardHandler<TBlockHandler>,
  TRollBackwardHandler = RollBackwardHandler<TBlockHandler>,
  TRollForwardPrepareContext = PrepareContext<TRollForwardHandler>,
  TRollForwardCommitContext = CommitContext<TRollForwardHandler>,
  TRollForwardPrepareResult = PrepareResult<TRollForwardHandler>,
  TRollBackwardPrepareContext = PrepareContext<TRollBackwardHandler>,
  TRollBackwardCommitContext = CommitContext<TRollBackwardHandler>,
  TRollBackwardPrepareResult = PrepareResult<TRollBackwardHandler>
> = BlockHandler<
  BlockEventHandler<
    TRollForwardPrepareContext & TRollForwardPrepareResult,
    TRollForwardCommitContext,
    TRollForwardPrepareResult & TRollForwardPrepareResultExt
  >,
  BlockEventHandler<
    TRollBackwardPrepareContext & TRollBackwardPrepareResult,
    TRollBackwardCommitContext,
    TRollBackwardPrepareResult & TRollBackwardPrepareResultExt
  >
>;

export interface BlockHandler<TRollForwardHandler, TRollBackwardHandler> {
  id: string;
  rollForward: TRollForwardHandler;
  rollBackward: TRollBackwardHandler;
  children?: ChildHandler<this, any, any>[];
}

// Example

type SomePrepareContext = {
  db: {
    query<T>(props: unknown): Promise<T>;
  };
};

type SomeCommitContext = {
  db: {
    insert(props: unknown): Promise<unknown>;
    delete(props: unknown): Promise<unknown>;
  };
  broker: {
    enqueueTask(props: unknown): Promise<unknown>;
    cancelTask(props: unknown): Promise<unknown>;
  };
};

type TokenMetadataHandler = ChildHandler<AssetHandler>;
const tokenMetadataHandler: TokenMetadataHandler = {
  id: 'token-metadata',
  rollBackward: {
    async commit({ db, broker }, { obsoleteAssets }) {
      await Promise.all(
        obsoleteAssets.map((assetId) =>
          Promise.all([broker.cancelTask(assetId), db.delete({ tokenMetadata: assetId })])
        )
      );
    }
  },
  rollForward: {
    async commit({ broker }, { newAssets }) {
      await Promise.all(
        newAssets.map((assetId) => broker.enqueueTask({ fetchAndWriteMetadataOf: assetId, taskId: assetId }))
      );
    }
  }
};

type AssetHandler = ChildHandler<
  typeof rootHandler,
  { newAssets: Cardano.AssetId[] },
  { obsoleteAssets: Cardano.AssetId[] }
>;
const assetHandler: AssetHandler = {
  children: [tokenMetadataHandler],
  id: 'asset',
  rollBackward: {
    async commit({ db }, { obsoleteAssets }) {
      await db.delete({ assets: obsoleteAssets });
    },
    async prepare() {
      // TODO: query and reutrn assets first minted in rolled back transactions
      return { obsoleteAssets: [] };
    }
  },
  rollForward: {
    async commit({ db }, { newAssets }) {
      await db.insert({ assetIds: newAssets });
    },
    async prepare({ db, block }) {
      const mintedAssetIds = block.transactions.flatMap((tx) => [...(tx.body.mint?.keys() || [])]);
      const existingAssets = await db.query<Cardano.AssetId[]>({ exists: mintedAssetIds });
      return {
        newAssets: mintedAssetIds.filter((assetId) => !existingAssets.includes(assetId))
      };
    }
  }
};

const rootHandler: BlockHandler<
  BlockEventHandler<SomePrepareContext & RollForwardContextBase, SomeCommitContext & RollForwardContextBase>,
  BlockEventHandler<SomePrepareContext & RollBackwardContextBase, SomeCommitContext & RollBackwardContextBase>
> = {
  children: [assetHandler],
  id: 'block',
  rollBackward: {
    async commit({ db, point }) {
      await db.delete({ since: point });
    }
  },
  rollForward: {
    async commit({ db, block }) {
      await db.insert({ block });
    }
  }
};

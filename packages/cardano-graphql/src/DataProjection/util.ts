import { BlockHandler, QueryResult, QueryVariables, RollForwardContext, Upsert } from './types';
import lodash from 'lodash-es';

// eslint-disable-next-line @typescript-eslint/no-empty-function
// const noOp = (): void => {};

const noQuery = (): QueryResult<QueryVariables> => ({ query: '', variables: {} });

export const mergedQuery = async (
  blockHandlers: BlockHandler[],
  ctx: RollForwardContext
): Promise<QueryResult<QueryVariables>> =>
  blockHandlers
    .map((handler) => (handler.query ? handler.query(ctx) : noQuery()))
    .reduce(async (acc, curr) => {
      const currResult = await curr;
      const accResult = await acc;
      return {
        query: currResult.query + accResult.query,
        variables: { ...currResult.variables, ...accResult.variables }
      };
    });

// export const mergedPreProcessingResults = async (
//   blockHandlers: BlockHandler[],
//   ctx: RollForwardContext,
//   queryResult: any
// ): Promise<any> =>
//   blockHandlers.map((handler) =>
//     handler.process
//       ? { func: handler.process(ctx, queryResult), handler: handler.id }
//       : { func: noOp(), id: handler.id }
//   );

export const mergedRollForwardUpsert = async (
  blockHandlers: BlockHandler[],
  ctx: RollForwardContext
  // processingResult: any
): Promise<Upsert> =>
  blockHandlers
    .map((handler) => handler.rollForward(ctx))
    .reduce(async (acc, curr) => lodash.merge(await acc, await curr));
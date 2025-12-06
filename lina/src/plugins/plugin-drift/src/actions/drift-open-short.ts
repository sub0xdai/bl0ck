/**
 * DRIFT_OPEN_SHORT Action
 *
 * Opens a leveraged short position on Drift Protocol.
 */

import { ACTION_NAMES } from '../constants';
import { createOpenPositionAction } from '../utils/action-factory';

export const driftOpenShort = createOpenPositionAction({
  side: 'short',
  actionName: ACTION_NAMES.DRIFT_OPEN_SHORT,
  similes: ['SHORT', 'SELL PERP', 'OPEN SHORT', 'GO SHORT', 'SHORT PERP', 'DRIFT SHORT'],
  description: 'Open a leveraged short position on Drift Protocol perpetuals',
});

export default driftOpenShort;

/**
 * DRIFT_OPEN_LONG Action
 *
 * Opens a leveraged long position on Drift Protocol.
 */

import { ACTION_NAMES } from '../constants';
import { createOpenPositionAction } from '../utils/action-factory';

export const driftOpenLong = createOpenPositionAction({
  side: 'long',
  actionName: ACTION_NAMES.DRIFT_OPEN_LONG,
  similes: ['LONG', 'BUY PERP', 'OPEN LONG', 'GO LONG', 'LONG PERP', 'DRIFT LONG'],
  description: 'Open a leveraged long position on Drift Protocol perpetuals',
});

export default driftOpenLong;

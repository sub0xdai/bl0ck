/**
 * PERP_OPEN_LONG Action
 *
 * Opens a leveraged long position on Hyperliquid.
 */

import { ACTION_NAMES } from '../constants';
import { createOpenPositionAction } from '../utils/action-factory';

export const perpOpenLong = createOpenPositionAction({
  side: 'long',
  actionName: ACTION_NAMES.PERP_OPEN_LONG,
  similes: ['LONG', 'BUY PERP', 'OPEN LONG', 'GO LONG', 'LONG PERP'],
  description: 'Open a leveraged long position on Hyperliquid perpetuals',
});

export default perpOpenLong;

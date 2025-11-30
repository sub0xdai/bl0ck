/**
 * PERP_OPEN_SHORT Action
 *
 * Opens a leveraged short position on Hyperliquid.
 */

import { ACTION_NAMES } from '../constants';
import { createOpenPositionAction } from '../utils/action-factory';

export const perpOpenShort = createOpenPositionAction({
  side: 'short',
  actionName: ACTION_NAMES.PERP_OPEN_SHORT,
  similes: ['SHORT', 'SELL PERP', 'OPEN SHORT', 'GO SHORT', 'SHORT PERP'],
  description: 'Open a leveraged short position on Hyperliquid perpetuals',
});

export default perpOpenShort;

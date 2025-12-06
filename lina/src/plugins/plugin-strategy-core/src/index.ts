import type { Plugin } from '@elizaos/core';
import { StrategyLoop } from './services/strategy-loop.service';

export const strategyCorePlugin: Plugin = {
    name: 'strategy-core',
    description: 'Core trading strategy engine (The Conductor)',
    services: [StrategyLoop],
    actions: [],
    evaluators: [],
    providers: [],
};

export default strategyCorePlugin;
export { StrategyLoop };

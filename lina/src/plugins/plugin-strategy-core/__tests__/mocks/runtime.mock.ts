/**
 * Mock Runtime Factory for Strategy-Core Integration Tests
 *
 * Creates mock IAgentRuntime instances with configurable services
 * for testing StrategyLoop, RiskManager, and other components.
 */
import type { IAgentRuntime } from '@elizaos/core';
import { type MockDriftService } from './drift-service.mock';

/**
 * Options for creating a mock runtime
 */
export interface MockRuntimeOptions {
    /** Mock DriftService instance */
    driftService?: MockDriftService | null;
    /** Agent ID */
    agentId?: string;
    /** Runtime settings overrides */
    settings?: Record<string, string>;
    /** Additional services */
    services?: Record<string, any>;
}

/**
 * Create a mock IAgentRuntime for testing
 */
export function createMockRuntime(options: MockRuntimeOptions = {}): IAgentRuntime {
    const {
        driftService = null,
        agentId = 'test-agent-123',
        settings = {},
        services = {},
    } = options;

    const allServices: Record<string, any> = {
        ...services,
    };

    if (driftService) {
        allServices['DRIFT_SERVICE'] = driftService;
    }

    return {
        agentId,
        character: {
            name: 'Test Lina',
            bio: ['Test agent'],
            lore: [],
            messageExamples: [],
            postExamples: [],
            topics: [],
            adjectives: [],
            style: { all: [], chat: [], post: [] },
        },
        getSetting: (key: string) => settings[key],
        getService: (type: string) => allServices[type] || null,
        registerService: (service: any) => { /* no-op */ },
        // Database adapter (minimal mock)
        databaseAdapter: {
            init: () => Promise.resolve(),
            close: () => Promise.resolve(),
            getMemories: () => Promise.resolve([]),
            searchMemories: () => Promise.resolve([]),
            getMemoryById: () => Promise.resolve(null),
            getMemoriesByRoomIds: () => Promise.resolve([]),
            createMemory: () => Promise.resolve(),
            removeMemory: () => Promise.resolve(),
            removeAllMemories: () => Promise.resolve(),
            countMemories: () => Promise.resolve(0),
            getGoals: () => Promise.resolve([]),
            updateGoal: () => Promise.resolve(),
            createGoal: () => Promise.resolve(),
            removeGoal: () => Promise.resolve(),
            removeAllGoals: () => Promise.resolve(),
            getRoom: () => Promise.resolve(null),
            createRoom: () => Promise.resolve('test-room'),
            removeRoom: () => Promise.resolve(),
            getRoomsForParticipant: () => Promise.resolve([]),
            getRoomsForParticipants: () => Promise.resolve([]),
            addParticipant: () => Promise.resolve(true),
            removeParticipant: () => Promise.resolve(true),
            getParticipantsForAccount: () => Promise.resolve([]),
            getParticipantsForRoom: () => Promise.resolve([]),
            getParticipantUserState: () => Promise.resolve(null),
            setParticipantUserState: () => Promise.resolve(),
            createRelationship: () => Promise.resolve(true),
            getRelationship: () => Promise.resolve(null),
            getRelationships: () => Promise.resolve([]),
            getCache: () => Promise.resolve(null),
            setCache: () => Promise.resolve(true),
            deleteCache: () => Promise.resolve(true),
            log: () => Promise.resolve(),
            getActorDetails: () => Promise.resolve([]),
        },
        // Message manager (minimal mock)
        messageManager: {
            addEmbeddingToMemory: () => Promise.resolve(null as any),
            getMemories: () => Promise.resolve([]),
            getCachedEmbeddings: () => Promise.resolve([]),
            searchMemoriesByEmbedding: () => Promise.resolve([]),
            createMemory: () => Promise.resolve(),
            removeMemory: () => Promise.resolve(),
            removeAllMemories: () => Promise.resolve(),
            countMemories: () => Promise.resolve(0),
            getMemoryById: () => Promise.resolve(null),
        },
        descriptionManager: null as any,
        documentsManager: null as any,
        knowledgeManager: null as any,
        loreManager: null as any,
        cacheManager: null as any,
        // State composition (minimal mock)
        composeState: () => Promise.resolve({
            userId: 'test-user',
            agentId,
            roomId: 'test-room',
            bio: '',
            lore: '',
            messageDirections: '',
            postDirections: '',
            actors: '',
            recentMessages: '',
            recentMessagesData: [],
            goals: '',
            goalsData: [],
            actions: '',
            providers: '',
            responseData: {},
            actionNames: '',
            actionExamples: '',
        }),
        updateRecentMessageState: () => Promise.resolve({} as any),
        // Plugin management
        plugins: [],
        actions: [],
        evaluators: [],
        providers: [],
        // Event handling
        registerAction: () => {},
        registerEvaluator: () => {},
        registerProvider: () => {},
        processActions: () => Promise.resolve(),
        evaluate: () => Promise.resolve([]),
        ensureConnection: () => Promise.resolve(),
        ensureParticipantInRoom: () => Promise.resolve(),
        ensureUserExists: () => Promise.resolve(),
        ensureParticipantExists: () => Promise.resolve(),
        ensureRoomExists: () => Promise.resolve(),
        // Utility
        getConversationLength: () => 0,
        fetch: globalThis.fetch,
    } as unknown as IAgentRuntime;
}

/**
 * Create a minimal mock runtime (for simple unit tests)
 */
export function createMinimalMockRuntime(
    driftService?: MockDriftService | null
): IAgentRuntime {
    return createMockRuntime({ driftService });
}

/**
 * Create a mock runtime configured for devnet testing
 */
export function createDevnetMockRuntime(
    driftService?: MockDriftService | null
): IAgentRuntime {
    return createMockRuntime({
        driftService,
        settings: {
            SOLANA_NETWORK: 'solana-devnet',
        },
    });
}

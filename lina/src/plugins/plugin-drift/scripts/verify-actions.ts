/**
 * Verification Script: Check all actions are properly exported
 */

import { driftPlugin } from '../src/index';
import { ACTION_NAMES } from '../src/constants';

console.log('Drift Plugin Action Registration Verification\n');

// Verify plugin structure
console.log('Plugin name:', driftPlugin.name);
console.log('Plugin description:', driftPlugin.description);
console.log('Total actions registered:', driftPlugin.actions.length);
console.log('Total services registered:', driftPlugin.services.length);
console.log('');

// Verify all expected actions are registered
const expectedActions = Object.values(ACTION_NAMES);
const registeredActions = driftPlugin.actions.map((action) => action.name);

console.log('Expected actions:', expectedActions.length);
console.log('Registered actions:', registeredActions.length);
console.log('');

// Check each expected action
let allPresent = true;
for (const actionName of expectedActions) {
  const isRegistered = registeredActions.includes(actionName);
  const status = isRegistered ? '✓' : '✗';
  console.log(`${status} ${actionName}`);
  if (!isRegistered) allPresent = false;
}

console.log('');

if (allPresent) {
  console.log('✅ All actions properly registered!');
  process.exit(0);
} else {
  console.error('❌ Some actions missing!');
  process.exit(1);
}

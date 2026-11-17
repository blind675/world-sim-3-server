'use strict';

const TWO_PI = Math.PI * 2;

function createBehaviorScheduler(catalog, rng) {
  function start(agent, id, tick) {
    const def = catalog.get(id);
    if (!def) throw new Error(`Unknown behavior: ${id}`);
    agent.behaviorCooldowns ??= {};
    agent.behaviorState = {
      id, startedTick: tick, stepIndex: 0,
      stepTicksLeft: def.algorithm === 'sequence' ? def.steps[0].ticks : 0,
    };
    return def;
  }

  function finish(agent, tick) {
    const state = agent.behaviorState;
    if (!state) return;
    const def = catalog.get(state.id);
    if (def?.kind === 'leisure') {
      agent.behaviorCooldowns ??= {};
      agent.behaviorCooldowns[state.id] = tick + def.cooldownTicks;
    }
    agent.behaviorState = null;
  }

  function timedOut(agent, tick) {
    const state = agent.behaviorState;
    return !!state && tick - state.startedTick >= catalog.get(state.id).maxTicks;
  }

  function selectLeisure(agent, tick) {
    const comfort = 1 - Math.max(agent.hunger, agent.thirst, agent.tiredness);
    const choices = catalog.leisure.filter(def => comfort >= def.minComfort
      && tick >= (agent.behaviorCooldowns?.[def.id] || 0));
    const total = choices.reduce((sum, def) => sum + def.weight, 0);
    if (total <= 0) return catalog.get('idle');
    let roll = rng() * total;
    for (const def of choices) {
      roll -= def.weight;
      if (roll < 0) return def;
    }
    return choices.at(-1);
  }

  // One action is performed per simulation tick. Turning changes the facing
  // angle now; perception uses the new direction on the following tick.
  function tickSequence(agent, tick) {
    const state = agent.behaviorState;
    const def = state && catalog.get(state.id);
    if (!def || def.algorithm !== 'sequence') return false;
    const step = def.steps[state.stepIndex];
    agent.state = 'idle';
    agent.currentAction = step.action;
    if (step.action === 'turn_right') agent.facing = (agent.facing + Math.PI / 2) % TWO_PI;
    if (step.action === 'turn_left') agent.facing = (agent.facing - Math.PI / 2 + TWO_PI) % TWO_PI;
    state.stepTicksLeft--;
    if (state.stepTicksLeft === 0) {
      state.stepIndex++;
      if (state.stepIndex < def.steps.length) state.stepTicksLeft = def.steps[state.stepIndex].ticks;
      else finish(agent, tick);
    }
    return true;
  }

  return { start, finish, timedOut, selectLeisure, tickSequence };
}

module.exports = { createBehaviorScheduler };

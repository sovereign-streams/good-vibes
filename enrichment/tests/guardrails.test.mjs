import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EthicalFilter } from '../src/guardrails/ethical-filter.mjs';

describe('EthicalFilter', () => {
  let filter;

  it('should load rules', () => {
    filter = new EthicalFilter();
    const rules = filter.getRules();
    assert.ok(rules.hard_exclusions.length > 0);
    assert.ok(rules.soft_filters.length > 0);
  });

  it('should pass clean content', () => {
    filter = new EthicalFilter();
    const result = filter.check({
      emotional_tone: {
        primary: 'calm',
        secondary: 'focused',
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: false,
        violence: false
      }
    });
    assert.equal(result.pass, true);
    assert.equal(result.violations.length, 0);
  });

  it('should fail violent content', () => {
    filter = new EthicalFilter();
    const result = filter.check({
      emotional_tone: {
        primary: 'energized',
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: false,
        violence: true
      }
    });
    assert.equal(result.pass, false);
    assert.ok(result.violations.includes('violence'));
  });

  it('should fail sexually explicit content', () => {
    filter = new EthicalFilter();
    const result = filter.check({
      emotional_tone: {
        primary: 'calm',
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: true,
        violence: false
      }
    });
    assert.equal(result.pass, false);
    assert.ok(result.violations.includes('sexually_explicit'));
  });

  it('should fail content with self-harm keywords', () => {
    filter = new EthicalFilter();
    const result = filter.check(
      {
        emotional_tone: {
          primary: 'calm',
          rage_bait: false,
          humiliation: false,
          shock_content: false,
          inflammatory: false,
          sexually_explicit: false,
          violence: false
        }
      },
      { title: 'How to hurt yourself tutorial', description: '' }
    );
    assert.equal(result.pass, false);
  });

  it('should flag but pass inflammatory content as soft filter', () => {
    filter = new EthicalFilter();
    const result = filter.check({
      emotional_tone: {
        primary: 'energized',
        rage_bait: false,
        humiliation: false,
        shock_content: false,
        inflammatory: true,
        sexually_explicit: false,
        violence: false
      }
    });
    // inflammatory is a soft filter, not hard exclusion by itself
    assert.ok(result.soft_flags.includes('inflammatory_politics'));
  });

  it('should fail humiliation content', () => {
    filter = new EthicalFilter();
    const result = filter.check({
      emotional_tone: {
        primary: 'amused',
        rage_bait: false,
        humiliation: true,
        shock_content: false,
        inflammatory: false,
        sexually_explicit: false,
        violence: false
      }
    });
    assert.equal(result.pass, false);
    assert.ok(result.violations.includes('extreme_degradation'));
  });
});

/**
 * Goal Celebration Utilities
 *
 * Provides confetti animations and milestone detection for financial goals.
 * Uses canvas-confetti for particle effects with retro-themed color palettes
 * that adapt to the active theme via CSS variables.
 */

import confetti from 'canvas-confetti';

// ============================================================================
// Milestone Thresholds
// ============================================================================

export const MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const;
export type MilestoneThreshold = (typeof MILESTONE_THRESHOLDS)[number];

export interface MilestoneInfo {
  threshold: MilestoneThreshold;
  label: string;
  emoji: string;
  description: string;
}

export const MILESTONE_INFO: Record<MilestoneThreshold, MilestoneInfo> = {
  25: {
    threshold: 25,
    label: 'Quarter Way',
    emoji: '\u2605',  // star
    description: 'Quarter way there!',
  },
  50: {
    threshold: 50,
    label: 'Halfway',
    emoji: '\u2605\u2605',
    description: 'Halfway point!',
  },
  75: {
    threshold: 75,
    label: 'Almost There',
    emoji: '\u2605\u2605\u2605',
    description: 'Three-quarters done!',
  },
  100: {
    threshold: 100,
    label: 'Goal Complete',
    emoji: '\u2605\u2605\u2605\u2605',
    description: 'Goal achieved!',
  },
};

// ============================================================================
// Milestone Detection
// ============================================================================

/**
 * Detect which milestones are crossed when moving from one percentage to another.
 * Returns an array of newly crossed milestone thresholds.
 */
export function detectCrossedMilestones(
  previousPercentage: number,
  newPercentage: number
): MilestoneThreshold[] {
  return MILESTONE_THRESHOLDS.filter(
    (threshold) => previousPercentage < threshold && newPercentage >= threshold
  );
}

/**
 * Get the highest milestone crossed for determining celebration intensity.
 */
export function getHighestCrossedMilestone(
  previousPercentage: number,
  newPercentage: number
): MilestoneThreshold | null {
  const crossed = detectCrossedMilestones(previousPercentage, newPercentage);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}

/**
 * Get all achieved milestone thresholds for a given percentage.
 */
export function getAchievedMilestones(percentage: number): MilestoneThreshold[] {
  return MILESTONE_THRESHOLDS.filter((threshold) => percentage >= threshold);
}

// ============================================================================
// Retro Color Palettes (matching the theme system)
// ============================================================================

// Amber Terminal palette - warm golds and ambers
const AMBER_COLORS = ['#d4a017', '#f5c842', '#e8a830', '#c4912a', '#ffd700', '#ffb347'];

// General celebration colors that work across all palettes
const CELEBRATION_COLORS = ['#ffd700', '#ff6b35', '#f7c948', '#e8a830', '#ffb347', '#ff8c00'];

/**
 * Get celebration colors. These warm gold/amber tones work with all palettes
 * and have a distinctly retro feel.
 */
function getCelebrationColors(): string[] {
  return AMBER_COLORS;
}

// ============================================================================
// Confetti Animations
// ============================================================================

/**
 * Fire a small burst of confetti for a 25% milestone.
 */
function fireSmallBurst(): void {
  const colors = getCelebrationColors();

  confetti({
    particleCount: 30,
    spread: 50,
    origin: { y: 0.7 },
    colors,
    scalar: 0.8,
    gravity: 1.2,
    ticks: 120,
  });
}

/**
 * Fire a medium shower for a 50% milestone.
 */
function fireMediumShower(): void {
  const colors = getCelebrationColors();

  // Two bursts from different angles
  confetti({
    particleCount: 40,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.65 },
    colors,
    scalar: 0.9,
    ticks: 150,
  });

  confetti({
    particleCount: 40,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.65 },
    colors,
    scalar: 0.9,
    ticks: 150,
  });
}

/**
 * Fire a large celebration for a 75% milestone.
 */
function fireLargeCelebration(): void {
  const colors = getCelebrationColors();

  // Multi-wave burst
  const fire = (delay: number) => {
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.6 },
        colors,
        scalar: 1,
        ticks: 180,
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.6 },
        colors,
        scalar: 1,
        ticks: 180,
      });
    }, delay);
  };

  fire(0);
  fire(200);
}

/**
 * Fire a grand finale for 100% goal completion.
 * Multiple waves with star-shaped confetti for the retro feel.
 */
function fireGrandFinale(): void {
  const colors = [...getCelebrationColors(), ...CELEBRATION_COLORS];
  const duration = 2500;
  const animationEnd = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
      shapes: ['circle', 'square'],
      scalar: 1.2,
      ticks: 200,
    });

    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
      shapes: ['circle', 'square'],
      scalar: 1.2,
      ticks: 200,
    });

    if (Date.now() < animationEnd) {
      requestAnimationFrame(frame);
    }
  };

  frame();

  // Big initial burst from center
  confetti({
    particleCount: 100,
    spread: 100,
    origin: { y: 0.6 },
    colors,
    shapes: ['circle', 'square'],
    scalar: 1.3,
    ticks: 250,
    gravity: 0.8,
  });
}

/**
 * Trigger the appropriate celebration animation for a milestone.
 */
export function celebrateMilestone(milestone: MilestoneThreshold): void {
  switch (milestone) {
    case 25:
      fireSmallBurst();
      break;
    case 50:
      fireMediumShower();
      break;
    case 75:
      fireLargeCelebration();
      break;
    case 100:
      fireGrandFinale();
      break;
  }
}

/**
 * Fire celebration for all crossed milestones (uses the highest one).
 * Returns the milestone info for the toast notification, or null if none crossed.
 */
export function celebrateGoalProgress(
  previousPercentage: number,
  newPercentage: number
): MilestoneInfo | null {
  const highestCrossed = getHighestCrossedMilestone(previousPercentage, newPercentage);

  if (highestCrossed === null) return null;

  // Small delay to let the modal close animation complete
  setTimeout(() => {
    celebrateMilestone(highestCrossed);
  }, 300);

  return MILESTONE_INFO[highestCrossed];
}

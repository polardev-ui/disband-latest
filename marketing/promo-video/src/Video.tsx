import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { S1Logo } from "./scenes/S1Logo";
import { S2Gateway } from "./scenes/S2Gateway";
import { S3Counter } from "./scenes/S3Counter";
import { S4Mobile } from "./scenes/S4Mobile";
import { S5Desktop } from "./scenes/S5Desktop";
import { S6Outro } from "./scenes/S6Outro";
import { THEME } from "./theme";

/**
 * The commercial, end to end.
 *
 * Cuts are short cross-fades rather than anything flashier: the stinger
 * already spends its energy on the colour flips, and a spin or a wipe between
 * every scene would fight the typography.
 */
export const DisbandPromo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: THEME.paper }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="1 · Logo stinger" durationInFrames={78}>
        <S1Logo />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 9 })} />

      <TransitionSeries.Sequence name="2 · Gateway" durationInFrames={92}>
        <S2Gateway />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 9 })} />

      <TransitionSeries.Sequence name="3 · Counter" durationInFrames={150}>
        <S3Counter />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 9 })} />

      <TransitionSeries.Sequence name="4 · iPhone" durationInFrames={132}>
        <S4Mobile />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 9 })} />

      <TransitionSeries.Sequence name="5 · Desktop" durationInFrames={132}>
        <S5Desktop />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 9 })} />

      <TransitionSeries.Sequence name="6 · Outro" durationInFrames={140}>
        <S6Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

/** 78+92+150+132+132+140 minus 5 overlaps of 9 = 679 frames ≈ 22.6s at 30fps. */
export const PROMO_DURATION = 78 + 92 + 150 + 132 + 132 + 140 - 5 * 9;

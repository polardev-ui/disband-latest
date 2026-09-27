import { Composition, Folder } from "remotion";
import { DisbandPromo, PROMO_DURATION } from "./Video";
import { S1Logo } from "./scenes/S1Logo";
import { S2Gateway } from "./scenes/S2Gateway";
import { S3Counter } from "./scenes/S3Counter";
import { S4Mobile } from "./scenes/S4Mobile";
import { S5Desktop } from "./scenes/S5Desktop";
import { S6Outro } from "./scenes/S6Outro";
import "./index.css";

/**
 * Vertical, because the brief says it is for TikTok — 1080x1920 is TikTok's
 * native frame. The brief also says "16:9"; the two cannot both be true, and
 * 16:9 letterboxes badly in a vertical feed. Switch WIDTH/HEIGHT below to
 * 1920x1080 if the 16:9 cut is what is wanted; the scenes are centred and
 * safe-area based, so they reflow rather than break.
 */
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="DisbandPromo"
      component={DisbandPromo}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={PROMO_DURATION}
    />
    {/* Each scene on its own timeline, so one can be retimed without
        scrubbing the whole film. */}
    <Folder name="Scenes">
      <Composition id="S1-Logo" component={S1Logo} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={78} />
      <Composition id="S2-Gateway" component={S2Gateway} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={92} />
      <Composition id="S3-Counter" component={S3Counter} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={150} />
      <Composition id="S4-Mobile" component={S4Mobile} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={132} />
      <Composition id="S5-Desktop" component={S5Desktop} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={132} />
      <Composition id="S6-Outro" component={S6Outro} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={140} />
    </Folder>
  </>
);

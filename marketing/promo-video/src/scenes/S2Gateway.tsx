import { AbsoluteFill } from "remotion";
import { TypeOn } from "../components/TypeOn";
import { SAFE, THEME, TYPE } from "../theme";

/** The line that states what Disband is for. Typed, centred, nothing else. */
export const S2Gateway: React.FC = () => (
  <AbsoluteFill
    name="Gateway line"
    style={{
      backgroundColor: THEME.paper,
      alignItems: "center",
      justifyContent: "center",
      padding: `${SAFE.y}px ${SAFE.x}px`,
    }}
  >
    <TypeOn
      name="Headline"
      text="A new gateway to privacy"
      from={6}
      speed={1.7}
      fontSize={TYPE.headline}
      weight={650}
    />
  </AbsoluteFill>
);

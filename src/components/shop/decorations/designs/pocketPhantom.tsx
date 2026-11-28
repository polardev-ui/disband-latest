import type { DecorationLayerProps, DesignSpec } from "../Decoration";
import "./pocketPhantom.css";

/*
 Pocket Phantom: a small sheet of translucent cloth that keeps you company
 at the photo's upper right.

 Drawn as fabric rather than a cartoon: a domed crown, a loose drape that
 falls in three soft folds to an uneven hem, a faint glowing edge, and two
 small dark openings for eyes, no mouth. It floats up and down, and the
 cloth below the crown stretches and gathers a beat behind the float, as
 cloth would. Every nine seconds it leans and looks to one side, holds,
 looks to the other, holds, and comes back, its eyes leading the turn. Its
 hem ripples on a quicker cycle, clipped inside the drape, and its
 opacity breathes on a slower one, so the four rhythms rarely line up.

 Hover lifts the glow along its edge.
*/

const SHEET = "M0 -20C7 -20 12 -14.5 12.2 -7C12.4 0 13 6 14.6 12C15.2 14.3 13.6 15.4 11.8 14.6C10 13.8 8.8 15.8 6.8 16.6C4.6 17.5 3.4 15.4 1.4 16C-.8 16.7 -2 18.6 -4.4 17.8C-6.6 17 -7.2 15.2 -9.4 15.6C-11.6 16 -13.6 15.4 -13.8 13.2C-14 10.4 -12.4 4 -12.2 -7C-12 -14.5 -7 -20 0 -20Z";
/** A lighter band of cloth along the hem, with a wavy upper edge. */
const HEM = "M-18 9C-14 7.6 -10.6 10.4 -6.8 9C-3 7.6 0 10.6 3.8 9.2C7.6 7.8 10.6 10.4 14.4 9C16.4 8.2 18 8.6 19 9V22H-18Z";

function Front({ uid }: DecorationLayerProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-cloth`} cx=".36" cy=".18" r=".95">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".97" />
          <stop offset=".55" stopColor="#eef0ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#c9cef4" stopOpacity=".8" />
        </radialGradient>
        <radialGradient id={`${uid}-aura`}>
          <stop offset=".45" stopColor="#dfe9ff" stopOpacity=".34" />
          <stop offset="1" stopColor="#b9ccff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-sheet`}>
          <path d={SHEET} />
        </clipPath>
      </defs>
      <g transform="translate(158 52)">
        <g className="pp-float di">
          <g className="pp-look di">
            <g className="pp-fade di">
              <ellipse className="pp-aura di" cx="0" cy="-1" rx="21" ry="26" fill={`url(#${uid}-aura)`} />
              <ellipse className="pp-aura-hover" cx="0" cy="-2" rx="17" ry="21" fill={`url(#${uid}-aura)`} />
              {/* The drape hangs from the crown and stretches below it. */}
              <g transform="translate(0 -20)">
                <g className="pp-stretch di">
                  <g transform="translate(0 20)">
                    <path d={SHEET} fill={`url(#${uid}-cloth)`} />
                    <g clipPath={`url(#${uid}-sheet)`}>
                      <g className="pp-hem di">
                        <path d={HEM} fill="#ffffff" opacity=".32" />
                        <path d="M-18 9C-14 7.6 -10.6 10.4 -6.8 9C-3 7.6 0 10.6 3.8 9.2C7.6 7.8 10.6 10.4 14.4 9C16.4 8.2 18 8.6 19 9" fill="none" stroke="#b7bde6" strokeWidth=".5" opacity=".5" />
                      </g>
                      {/* Folds: a shaded valley with a lit ridge beside it. */}
                      <path d="M5.4 -5.6C6.4 2 7.8 8 7.4 14.6" fill="none" stroke="#a9b0e0" strokeWidth="1.3" strokeLinecap="round" opacity=".45" />
                      <path d="M6.6 -4.8C7.6 2.2 9 8 8.8 14" fill="none" stroke="#ffffff" strokeWidth=".6" strokeLinecap="round" opacity=".6" />
                      <path d="M-4.2 -2.6C-5.2 4 -6.6 9.6 -7.2 15.4" fill="none" stroke="#a9b0e0" strokeWidth="1.2" strokeLinecap="round" opacity=".42" />
                      <path d="M-3 -2.2C-3.8 4.2 -5 9.6 -5.4 15.6" fill="none" stroke="#ffffff" strokeWidth=".55" strokeLinecap="round" opacity=".55" />
                      <path d="M.8 3C1.4 8.2 .8 12.4 1.6 16.4" fill="none" stroke="#a9b0e0" strokeWidth="1" strokeLinecap="round" opacity=".35" />
                      {/* Shade under the crown where the cloth turns down. */}
                      <path d="M-12.2 -4C-6 -1.6 6 -1.6 12.2 -4" fill="none" stroke="#b9bfe9" strokeWidth="1.6" opacity=".3" />
                    </g>
                    {/* A lavender rim (an edge on light surfaces, a glow on dark ones)
                        with a bright line just inside it. */}
                    <path d={SHEET} fill="none" stroke="#9ea6dc" strokeWidth="1" strokeLinejoin="round" opacity=".85" />
                    <path d={SHEET} fill="none" stroke="#f7faff" strokeWidth=".45" strokeLinejoin="round" opacity=".95" />
                    <path d="M-8.6 -15C-5.6 -18.4 -1 -19 2.4 -18.4" fill="none" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" opacity=".8" />
                  </g>
                </g>
              </g>
              <g className="pp-eyes di">
                <ellipse cx="-3.7" cy="-8.2" rx="1.45" ry="2.1" fill="#3a3e66" opacity=".82" />
                <ellipse cx="3.3" cy="-8.2" rx="1.45" ry="2.1" fill="#3a3e66" opacity=".82" />
                <circle cx="-4.1" cy="-9" r=".42" fill="#ffffff" opacity=".8" />
                <circle cx="2.9" cy="-9" r=".42" fill="#ffffff" opacity=".8" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </>
  );
}

export const pocketPhantom: DesignSpec = {
  cycleMs: 1200,
  gapMs: null,
  front: (p) => <Front {...p} />,
};

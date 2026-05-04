import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Tutorial, TutorialScene } from "./tutorialData";

const blue = "#0f3460";
const orange = "#f27a1a";
const soft = "#f8fbff";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const slide = (frame: number, start: number, end: number, from: number) =>
  interpolate(frame, [start, end], [from, 0], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const ScenePanel: React.FC<{
  scene: TutorialScene;
  accent: string;
  localFrame: number;
}> = ({ scene, accent, localFrame }) => {
  const titleOpacity = fade(localFrame, 0, 18);
  const titleY = slide(localFrame, 0, 20, 32);
  const cardScale = spring({
    frame: Math.max(0, localFrame - 8),
    fps: 30,
    config: { damping: 18, stiffness: 120 },
  });
  const progress = interpolate(localFrame, [20, 112], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ padding: 54 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "0.92fr 1.08fr",
          gap: 36,
          height: "100%",
          alignItems: "center",
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              color: accent,
              background: "#fff4e8",
              border: `1px solid ${accent}33`,
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 24,
              fontWeight: 800,
              marginBottom: 22,
            }}
          >
            {scene.eyebrow}
          </div>
          <h2
            style={{
              color: blue,
              fontSize: 58,
              lineHeight: 1.02,
              margin: 0,
              fontWeight: 900,
              letterSpacing: 0,
            }}
          >
            {scene.title}
          </h2>
          <p
            style={{
              color: "#475569",
              fontSize: 28,
              lineHeight: 1.35,
              marginTop: 24,
              maxWidth: 560,
            }}
          >
            {scene.body}
          </p>
          <div
            style={{
              marginTop: 30,
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              color: blue,
              fontSize: 25,
              fontWeight: 800,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 50,
                background: accent,
                display: "inline-block",
              }}
            />
            {scene.callout}
          </div>
        </div>

        <div
          style={{
            transform: `scale(${0.9 + cardScale * 0.1})`,
            opacity: fade(localFrame, 8, 24),
            background: "white",
            borderRadius: 22,
            padding: 26,
            boxShadow: "0 26px 70px rgba(15, 52, 96, 0.18)",
            border: "1px solid #dbeafe",
            height: 510,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(26,86,160,0.07), rgba(242,122,26,0.07))",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                height: 56,
                borderRadius: 14,
                background: blue,
                display: "flex",
                alignItems: "center",
                padding: "0 18px",
                color: "white",
                fontSize: 20,
                fontWeight: 800,
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 50,
                  background: orange,
                }}
              />
              Quote Dr
              <div style={{ marginLeft: "auto", fontSize: 16, opacity: 0.8 }}>
                Tutorial
              </div>
            </div>
            <div
              style={{
                marginTop: 22,
                background: soft,
                borderRadius: 16,
                padding: 20,
                border: `2px solid ${accent}`,
              }}
            >
              <div style={{ color: accent, fontSize: 18, fontWeight: 900 }}>
                {scene.highlight}
              </div>
              <div
                style={{
                  height: 10,
                  background: "#dbeafe",
                  borderRadius: 99,
                  marginTop: 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: accent,
                    borderRadius: 99,
                  }}
                />
              </div>
            </div>
            <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
              {scene.fields.map((field, index) => {
                const rowOpacity = fade(localFrame, 24 + index * 10, 42 + index * 10);
                const rowX = slide(localFrame, 24 + index * 10, 44 + index * 10, 30);
                return (
                  <div
                    key={field}
                    style={{
                      opacity: rowOpacity,
                      transform: `translateX(${rowX}px)`,
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      padding: "18px 20px",
                      display: "flex",
                      alignItems: "center",
                      color: blue,
                      fontSize: 23,
                      fontWeight: 750,
                      boxShadow: "0 8px 18px rgba(15, 52, 96, 0.06)",
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 50,
                        background: "#22c55e",
                        marginRight: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 15,
                        fontWeight: 900,
                      }}
                    >
                      OK
                    </span>
                    {field}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const TutorialComposition: React.FC<{ tutorial: Tutorial }> = ({
  tutorial,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const introEnd = 90;
  const outroStart = durationInFrames - 60;
  const sceneFrames = Math.floor((outroStart - introEnd) / tutorial.scenes.length);
  const introOpacity = interpolate(frame, [0, 20, 70, 88], [1, 1, 1, 0], clamp);
  const outroOpacity = fade(frame, outroStart, durationInFrames - 20);

  let activeSceneIndex = Math.min(
    tutorial.scenes.length - 1,
    Math.max(0, Math.floor((frame - introEnd) / sceneFrames)),
  );
  const localFrame = frame - introEnd - activeSceneIndex * sceneFrames;
  if (frame < introEnd) activeSceneIndex = 0;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 10%, rgba(242,122,26,0.18), transparent 28%), linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%)",
        fontFamily:
          'Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 12,
          background: `linear-gradient(90deg, ${tutorial.accent}, ${orange})`,
        }}
      />
      {frame < introEnd && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
            opacity: introOpacity,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: orange,
              fontWeight: 900,
              fontSize: 34,
              marginBottom: 18,
            }}
          >
            Quote Dr Tutorial
          </div>
          <h1
            style={{
              color: blue,
              fontSize: 74,
              lineHeight: 1,
              margin: 0,
              fontWeight: 950,
              letterSpacing: 0,
              maxWidth: 950,
            }}
          >
            {tutorial.title}
          </h1>
          <p
            style={{
              color: "#475569",
              fontSize: 30,
              lineHeight: 1.3,
              marginTop: 24,
              maxWidth: 820,
            }}
          >
            {tutorial.subtitle}
          </p>
        </AbsoluteFill>
      )}
      {frame >= introEnd && frame < outroStart && (
        <ScenePanel
          scene={tutorial.scenes[activeSceneIndex]}
          accent={tutorial.accent}
          localFrame={localFrame}
        />
      )}
      {frame >= outroStart && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            opacity: outroOpacity,
            padding: 80,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 28,
              padding: "50px 64px",
              boxShadow: "0 26px 70px rgba(15, 52, 96, 0.18)",
              border: "1px solid #dbeafe",
            }}
          >
            <div style={{ color: orange, fontSize: 32, fontWeight: 900 }}>
              You're ready.
            </div>
            <div
              style={{
                marginTop: 14,
                color: blue,
                fontSize: 46,
                fontWeight: 950,
              }}
            >
              Try it in Quote Dr
            </div>
            <div
              style={{
                marginTop: 18,
                color: "#64748b",
                fontSize: 24,
              }}
            >
              Open the tool, follow the steps, and review before sending.
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

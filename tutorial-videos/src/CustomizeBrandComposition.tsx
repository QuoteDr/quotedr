import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

type Step = {
  image: string;
  start: number;
  end: number;
  title: string;
  detail: string;
  cursor: [number, number];
  zoom: number;
  panX: number;
  panY: number;
};

const steps: Step[] = [
  {
    image: "captures/customize-brand/01-logo-settings.png",
    start: 0,
    end: 105,
    title: "Add your company logo",
    detail: "Upload the ALD Direct logo and set the business name that appears on client quotes.",
    cursor: [512, 307],
    zoom: 1.08,
    panX: -34,
    panY: -18,
  },
  {
    image: "captures/customize-brand/02-style-modal.png",
    start: 95,
    end: 225,
    title: "Choose quote colours",
    detail: "Pick a style preset, accent colour, background tint, and header strength.",
    cursor: [799, 251],
    zoom: 1.04,
    panX: 0,
    panY: 0,
  },
  {
    image: "captures/customize-brand/04-terms.png",
    start: 215,
    end: 335,
    title: "Select the right terms",
    detail: "Toggle the terms and conditions that match this job before the client sees it.",
    cursor: [36, 246],
    zoom: 1.1,
    panX: -8,
    panY: -56,
  },
  {
    image: "captures/customize-brand/03-commitment-icons.png",
    start: 325,
    end: 450,
    title: "Customize commitment icons",
    detail: "Choose catalog icons or upload images for warranties, insurance, scheduling, and service promises.",
    cursor: [683, 365],
    zoom: 1.05,
    panX: 0,
    panY: 0,
  },
  {
    image: "captures/customize-brand/05-client-quote.png",
    start: 440,
    end: 570,
    title: "Preview the finished quote",
    detail: "The client sees your branding, colour choices, terms, upgrades, and approval flow.",
    cursor: [953, 615],
    zoom: 1,
    panX: 0,
    panY: 0,
  },
];

const activeStep = (frame: number) => {
  return steps.find((step) => frame >= step.start && frame < step.end) || steps[steps.length - 1];
};

const stepFrame = (frame: number, step: Step) => frame - step.start;

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const Cursor: React.FC<{ step: Step; localFrame: number }> = ({ step, localFrame }) => {
  const clickPulse = interpolate(localFrame % 54, [0, 16, 34], [0, 1, 0], clamp);
  const cursorIn = fade(localFrame, 10, 24);
  const cursorX = interpolate(localFrame, [0, 48, 92], [step.cursor[0] - 42, step.cursor[0], step.cursor[0] + 12], clamp);
  const cursorY = interpolate(localFrame, [0, 48, 92], [step.cursor[1] + 34, step.cursor[1], step.cursor[1] + 6], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: cursorX,
        top: cursorY,
        opacity: cursorIn,
        transform: "translate(-4px, -2px)",
        filter: "drop-shadow(0 12px 20px rgba(15,52,96,0.25))",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 6,
          top: 4,
          width: 56 + clickPulse * 30,
          height: 56 + clickPulse * 30,
          borderRadius: 999,
          border: "4px solid rgba(232,126,42,0.65)",
          transform: `translate(-50%, -50%) scale(${0.7 + clickPulse * 0.4})`,
          opacity: clickPulse,
        }}
      />
      <svg width="42" height="46" viewBox="0 0 42 46" fill="none">
        <path
          d="M7 4L35 25L22 27L16 41L7 4Z"
          fill="#ffffff"
          stroke="#0f3460"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M22 27L30 39" stroke="#0f3460" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const Caption: React.FC<{ step: Step; localFrame: number }> = ({ step, localFrame }) => {
  const opacity = Math.min(fade(localFrame, 0, 18), interpolate(localFrame, [92, 116], [1, 0], clamp));
  const y = interpolate(localFrame, [0, 22], [28, 0], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 42,
        right: 42,
        bottom: 34,
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          background: "rgba(15, 52, 96, 0.95)",
          color: "white",
          borderRadius: 14,
          padding: "18px 22px",
          boxShadow: "0 22px 55px rgba(15, 52, 96, 0.35)",
          border: "1px solid rgba(255,255,255,0.22)",
          maxWidth: 850,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#f97316",
              display: "inline-block",
            }}
          />
          <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: 0 }}>{step.title}</div>
        </div>
        <div style={{ marginTop: 7, color: "#dbeafe", fontSize: 20, lineHeight: 1.35 }}>{step.detail}</div>
      </div>
      <div
        style={{
          marginLeft: "auto",
          background: "#ffffff",
          color: "#0f3460",
          borderRadius: 999,
          padding: "12px 18px",
          fontSize: 18,
          fontWeight: 900,
          border: "2px solid #f97316",
          boxShadow: "0 15px 34px rgba(15, 52, 96, 0.18)",
        }}
      >
        Real QuoteDr UI
      </div>
    </div>
  );
};

export const CustomizeBrandComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const step = activeStep(frame);
  const localFrame = stepFrame(frame, step);
  const sceneOpacity = Math.min(
    fade(frame, step.start, step.start + 18),
    interpolate(frame, [step.end - 18, step.end], [1, 0], clamp),
  );
  const zoomDrift = interpolate(localFrame, [0, step.end - step.start], [step.zoom, step.zoom + 0.018], clamp);
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 100], clamp);

  return (
    <AbsoluteFill style={{ background: "#0f3460", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, #eef4fb 0%, #ffffff 55%, #fff4e8 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 26,
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 34px 90px rgba(15, 52, 96, 0.32)",
          border: "1px solid rgba(15,52,96,0.16)",
          background: "#eef4fb",
        }}
      >
        <Img
          src={staticFile(step.image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: sceneOpacity,
            transform: `translate(${step.panX}px, ${step.panY}px) scale(${zoomDrift})`,
            transformOrigin: "center center",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(15,52,96,0.02), rgba(15,52,96,0.12))",
            pointerEvents: "none",
          }}
        />
        <Cursor step={step} localFrame={localFrame} />
        <Caption step={step} localFrame={localFrame} />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 8,
            background: "rgba(15,52,96,0.14)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #1a56a0, #f97316)",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

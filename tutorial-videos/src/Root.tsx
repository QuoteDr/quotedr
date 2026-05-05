import "./index.css";
import { Composition } from "remotion";
import { CustomizeBrandComposition } from "./CustomizeBrandComposition";
import { TutorialComposition } from "./TutorialComposition";
import { tutorials } from "./tutorialData";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {tutorials.map((tutorial) => (
        <Composition
          key={tutorial.id}
          id={tutorial.id}
          component={TutorialComposition}
          durationInFrames={tutorial.durationInFrames}
          fps={30}
          width={1280}
          height={720}
          defaultProps={{ tutorial }}
        />
      ))}
      <Composition
        id="customize-brand"
        component={CustomizeBrandComposition}
        durationInFrames={570}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};

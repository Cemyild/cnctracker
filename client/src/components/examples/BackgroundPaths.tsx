import { BackgroundPaths } from '../BackgroundPaths';

export default function BackgroundPathsExample() {
  return (
    <div className="relative w-full h-64 bg-background rounded-lg overflow-hidden">
      <BackgroundPaths />
      <div className="relative z-10 flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Animated background paths</p>
      </div>
    </div>
  );
}

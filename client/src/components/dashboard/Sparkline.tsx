import { useMemo } from "react";

interface SparklineProps {
    values: number[];
    color?: string;
    height?: number;
    showArea?: boolean;
}

export function Sparkline({ values, color = "currentColor", height = 32, showArea = true }: SparklineProps) {
    const { path, areaPath, width } = useMemo(() => {
        const w = 100;
        const h = height;
        if (values.length === 0) {
            return { path: "", areaPath: "", width: w };
        }
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = max - min || 1;
        const step = values.length > 1 ? w / (values.length - 1) : 0;

        const points = values.map((v, i) => {
            const x = i * step;
            const y = h - ((v - min) / range) * (h - 4) - 2;
            return [x, y];
        });

        const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
        const area = `${line} L${(points[points.length - 1][0]).toFixed(2)},${h} L0,${h} Z`;

        return { path: line, areaPath: area, width: w };
    }, [values, height]);

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height, color }}
            aria-hidden="true"
        >
            {showArea && <path d={areaPath} fill="currentColor" fillOpacity={0.12} />}
            <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

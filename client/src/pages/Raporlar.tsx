import { BackgroundPaths } from "@/components/BackgroundPaths";

export default function Raporlar() {
    return (
        <div className="relative min-h-full">
            <BackgroundPaths />
            <div className="relative z-10 p-6 lg:p-8">
                <h2 className="text-2xl font-bold mb-4">Raporlar</h2>
                <p className="text-muted-foreground">Raporlama ve analiz işlemleri için burası kullanılacaktır.</p>
            </div>
        </div>
    );
}

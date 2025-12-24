import { BackgroundPaths } from "@/components/BackgroundPaths";

export default function Sigorta() {
    return (
        <div className="relative min-h-full">
            <BackgroundPaths />
            <div className="relative z-10 p-6 lg:p-8">
                <h2 className="text-2xl font-bold mb-4">Sigorta</h2>
                <p className="text-muted-foreground">Sigorta verileri ve yönetimi için burası kullanılacaktır.</p>
            </div>
        </div>
    );
}

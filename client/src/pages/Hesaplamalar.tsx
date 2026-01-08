
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Hesaplamalar() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Hesaplamalar</h2>
            </div>
            <Tabs defaultValue="maas" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="maas">Maaş</TabsTrigger>
                    <TabsTrigger value="yemek">Yemek</TabsTrigger>
                    <TabsTrigger value="tarife">Tarife</TabsTrigger>
                </TabsList>

                <TabsContent value="maas" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Maaş Hesaplamaları</CardTitle>
                            <CardDescription>Maaş ile ilgili hesaplamalar burada yapılacak.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground">Bu alan yapım aşamasındadır.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="yemek" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Yemek Hesaplamaları</CardTitle>
                            <CardDescription>Yemek ücreti hesaplamaları burada yapılacak.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground">Bu alan yapım aşamasındadır.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="tarife" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Tarife Hesaplamaları</CardTitle>
                            <CardDescription>Tarife hesaplamaları burada yapılacak.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground">Bu alan yapım aşamasındadır.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

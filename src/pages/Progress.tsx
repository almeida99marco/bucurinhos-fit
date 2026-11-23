import { useEffect, useRef, useState } from "react";
import { Camera, Lock, Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { backend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";
import { logActivity, useData } from "@/hooks/useData";
import type { BodyMeasurement, ProgressPhoto } from "@/lib/types";
import { bmi } from "@/lib/calc";
import { cn, compressImage, lastPerDate, fmtDate, fmtNum, toNum, today } from "@/lib/utils";
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, PageLoader, Select, Tabs, Textarea } from "@/components/ui";
import { useAction, useFeedback } from "@/components/feedback";
import { AreaTrend, MultiLine } from "@/components/charts";

type Tab = "medidas" | "graficos" | "comparar" | "fotos";

export const MEASURE_FIELDS: { key: keyof BodyMeasurement; label: string; unit: string }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "body_fat_pct", label: "Gordura corporal", unit: "%" },
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "abdomen_cm", label: "Abdômen", unit: "cm" },
  { key: "chest_cm", label: "Peito", unit: "cm" },
  { key: "arm_cm", label: "Braços", unit: "cm" },
  { key: "thigh_cm", label: "Coxas", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
];

export default function ProgressPage() {
  const [tab, setTab] = useState<Tab>("medidas");
  const { data, loading, reload } = useData(() => backend.list<BodyMeasurement>("body_measurements", { order: [["date", "asc"], ["created_at", "asc"]] }), []);
  const [edit, setEdit] = useState<Partial<BodyMeasurement> | null>(null);
  if (loading) return <PageLoader />;
  const ms = data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Evolução"
        subtitle="Peso, medidas corporais e fotos de progresso."
        action={
          <Button onClick={() => setEdit({ date: today() })}>
            <Plus className="h-4 w-4" /> Nova medição
          </Button>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "medidas", label: "Medidas" },
          { value: "graficos", label: "Gráficos" },
          { value: "comparar", label: "Comparar datas" },
          { value: "fotos", label: "Fotos" },
        ]}
      />
      {tab === "medidas" && <MeasureList ms={ms} onEdit={setEdit} reload={reload} />}
      {tab === "graficos" && <MeasureCharts ms={ms} />}
      {tab === "comparar" && <Compare ms={ms} />}
      {tab === "fotos" && <Photos />}
      <MeasureModal m={edit} onClose={() => setEdit(null)} onSaved={reload} latestDate={ms[ms.length - 1]?.date} />
    </div>
  );
}

function MeasureList({ ms, onEdit, reload }: { ms: BodyMeasurement[]; onEdit: (m: BodyMeasurement) => void; reload: () => void }) {
  const { profile } = useAuth();
  const { run } = useAction();
  const { confirm } = useFeedback();
  if (!ms.length) return <Empty icon={<Ruler className="h-8 w-8" />} title="Nenhuma medição registrada" text="Registre peso e medidas para acompanhar sua evolução." />;
  const last = ms[ms.length - 1];
  const first = ms[0];
  const lastWeight = [...ms].reverse().find((m) => m.weight_kg != null)?.weight_kg;
  const firstWeight = ms.find((m) => m.weight_kg != null)?.weight_kg;
  const imc = bmi(lastWeight, profile?.height_cm);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted">Peso atual</p>
          <p className="text-2xl font-bold">{fmtNum(lastWeight, 1)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Variação total</p>
          <p className="text-2xl font-bold">{lastWeight != null && firstWeight != null ? `${lastWeight - firstWeight > 0 ? "+" : ""}${fmtNum(lastWeight - firstWeight, 1)} kg` : "—"}</p>
          <p className="text-[11px] text-muted">desde {fmtDate(first.date)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">IMC</p>
          <p className="text-2xl font-bold">{fmtNum(imc, 1)}</p>
          <p className="text-[11px] text-muted">indicador populacional, não diagnóstico</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Última medição</p>
          <p className="text-2xl font-bold">{fmtDate(last.date, "dd/MM")}</p>
        </Card>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="p-3 font-medium">Data</th>
              {MEASURE_FIELDS.map((f) => (
                <th key={f.key} className="p-3 text-right font-medium">
                  {f.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...ms].reverse().map((m) => (
              <tr key={m.id}>
                <td className="p-3">{fmtDate(m.date)}</td>
                {MEASURE_FIELDS.map((f) => (
                  <td key={f.key} className="p-3 text-right text-muted">
                    {m[f.key] != null ? `${fmtNum(m[f.key] as number, 1)}` : "—"}
                  </td>
                ))}
                <td className="p-2">
                  <div className="flex justify-end">
                    <Button size="icon" variant="ghost" onClick={() => onEdit(m)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir"
                      onClick={async () => {
                        if (await confirm({ title: "Excluir medição?", text: fmtDate(m.date), danger: true, confirmLabel: "Excluir" }))
                          run("d", async () => {
                            await backend.remove("body_measurements", m.id);
                            reload();
                          }, "Medição excluída.");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MeasureModal({ m, onClose, onSaved, latestDate }: { m: Partial<BodyMeasurement> | null; onClose: () => void; onSaved: () => void; latestDate?: string }) {
  const { updateProfile } = useAuth();
  const [v, setV] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  useEffect(() => {
    if (!m) return;
    const init: Record<string, string> = { date: m.date ?? today(), notes: m.notes ?? "" };
    for (const f of MEASURE_FIELDS) init[f.key] = m[f.key] != null ? String(m[f.key]) : "";
    setV(init);
  }, [m]);
  if (!m) return null;
  const save = () =>
    run("s", async () => {
      if (!v.date) throw new Error("Informe a data.");
      const payload: Record<string, unknown> = { date: v.date, notes: v.notes?.trim() || null };
      let any = false;
      for (const f of MEASURE_FIELDS) {
        const n = toNum(v[f.key]);
        if (n != null && (n <= 0 || n > 400)) throw new Error(`${f.label}: valor inválido.`);
        if (f.key === "body_fat_pct" && n != null && (n < 2 || n > 70)) throw new Error("Gordura corporal deve estar entre 2% e 70%.");
        payload[f.key] = n;
        if (n != null) any = true;
      }
      if (!any) throw new Error("Preencha ao menos uma medida.");
      if (m.id) await backend.update("body_measurements", m.id, payload);
      else {
        await backend.insert("body_measurements", payload);
        logActivity("medidas", payload.weight_kg ? `Medição registrada: ${fmtNum(payload.weight_kg as number, 1)} kg` : "Medidas registradas", { date: v.date });
      }
      if (payload.weight_kg != null && (!latestDate || v.date >= latestDate)) await updateProfile({ weight_kg: payload.weight_kg as number });
      onClose();
      onSaved();
    }, "Medição salva.");
  return (
    <Modal open onClose={onClose} title={m.id ? "Editar medição" : "Nova medição"}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data" className="col-span-2">
          <Input type="date" value={v.date ?? ""} max={today()} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} />
        </Field>
        {MEASURE_FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label} (${f.unit})`}>
            <Input inputMode="decimal" value={v[f.key] ?? ""} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.key === "body_fat_pct" ? "se souber" : ""} />
          </Field>
        ))}
        <Field label="Observações" className="col-span-2">
          <Textarea rows={2} value={v.notes ?? ""} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </div>
      <Button className="mt-5 w-full" onClick={save} loading={busy === "s"}>
        Salvar
      </Button>
    </Modal>
  );
}

function MeasureCharts({ ms }: { ms: BodyMeasurement[] }) {
  const w = lastPerDate(ms.filter((m) => m.weight_kg != null)).map((m) => ({ d: fmtDate(m.date, "dd/MM"), v: Number(m.weight_kg) }));
  const bf = lastPerDate(ms.filter((m) => m.body_fat_pct != null)).map((m) => ({ d: fmtDate(m.date, "dd/MM"), v: Number(m.body_fat_pct) }));
  const circ = MEASURE_FIELDS.filter((f) => f.unit === "cm");
  const cm = ms.filter((m) => circ.some((f) => m[f.key] != null)).map((m) => ({ d: fmtDate(m.date, "dd/MM"), ...Object.fromEntries(circ.map((f) => [f.key, m[f.key] != null ? Number(m[f.key]) : null])) }));
  const used = circ.filter((f) => cm.some((r: any) => r[f.key] != null));
  if (ms.length < 2) return <Empty title="Registre pelo menos duas medições" text="Os gráficos de evolução aparecem a partir da segunda medição." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>Peso</CardTitle>
        {w.length > 1 ? <AreaTrend data={w} x="d" y="v" unit="kg" name="Peso" /> : <p className="py-8 text-center text-sm text-muted">Poucos registros de peso.</p>}
      </Card>
      <Card>
        <CardTitle>Gordura corporal</CardTitle>
        {bf.length > 1 ? <AreaTrend data={bf} x="d" y="v" unit="%" name="Gordura" /> : <p className="py-8 text-center text-sm text-muted">Registre o percentual de gordura quando souber.</p>}
      </Card>
      <Card className="lg:col-span-2">
        <CardTitle>Circunferências (cm)</CardTitle>
        {cm.length > 1 ? <MultiLine data={cm} x="d" lines={used.map((f) => ({ key: f.key, name: f.label }))} unit="cm" height={260} /> : <p className="py-8 text-center text-sm text-muted">Registre medidas em pelo menos duas datas.</p>}
      </Card>
    </div>
  );
}

function Compare({ ms }: { ms: BodyMeasurement[] }) {
  const { data: photos } = useData(() => backend.list<ProgressPhoto>("progress_photos", { order: [["date", "asc"]] }), []);
  const [a, setA] = useState(ms[0]?.id ?? "");
  const [b, setB] = useState(ms[ms.length - 1]?.id ?? "");
  if (ms.length < 2) return <Empty title="Registre pelo menos duas medições" text="Depois, compare quaisquer duas datas aqui." />;
  const A = ms.find((m) => m.id === a);
  const B = ms.find((m) => m.id === b);
  const near = (date?: string) => (photos ?? []).filter((p) => date && p.date <= date).slice(-1)[0];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data inicial">
          <Select value={a} onChange={(e) => setA(e.target.value)}>
            {ms.map((m) => (
              <option key={m.id} value={m.id}>
                {fmtDate(m.date)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data final">
          <Select value={b} onChange={(e) => setB(e.target.value)}>
            {ms.map((m) => (
              <option key={m.id} value={m.id}>
                {fmtDate(m.date)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {A && B && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="p-3 font-medium">Medida</th>
                <th className="p-3 text-right font-medium">{fmtDate(A.date, "dd/MM/yy")}</th>
                <th className="p-3 text-right font-medium">{fmtDate(B.date, "dd/MM/yy")}</th>
                <th className="p-3 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MEASURE_FIELDS.map((f) => {
                const x = A[f.key] as number | null;
                const y = B[f.key] as number | null;
                const d = x != null && y != null ? y - x : null;
                return (
                  <tr key={f.key}>
                    <td className="p-3">{f.label}</td>
                    <td className="p-3 text-right text-muted">{x != null ? `${fmtNum(x, 1)} ${f.unit}` : "—"}</td>
                    <td className="p-3 text-right text-muted">{y != null ? `${fmtNum(y, 1)} ${f.unit}` : "—"}</td>
                    <td className={cn("p-3 text-right font-semibold", d == null ? "text-muted" : d < 0 ? "text-brand" : d > 0 ? "text-amber-600" : "")}>
                      {d == null ? "—" : `${d > 0 ? "+" : ""}${fmtNum(d, 1)} ${f.unit}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        {[A, B].map((m, i) => {
          const p = near(m?.date);
          return (
            <Card key={i} className="p-2">
              {p ? <PhotoImg photo={p} /> : <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-surface2 text-xs text-muted">Sem foto até esta data</div>}
              <p className="mt-2 text-center text-xs text-muted">{p ? fmtDate(p.date) : fmtDate(m?.date)}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PhotoImg({ photo, className }: { photo: ProgressPhoto; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    backend.fileUrl("progress-photos", photo.storage_path).then(setUrl).catch(() => setUrl(""));
  }, [photo.storage_path]);
  return url ? <img src={url} alt={`Foto de ${fmtDate(photo.date)}`} className={cn("aspect-[3/4] w-full rounded-xl object-cover", className)} /> : <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-surface2" />;
}

function Photos() {
  const { data, loading, reload } = useData(() => backend.list<ProgressPhoto>("progress_photos", { order: [["date", "desc"]] }), []);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ date: today(), pose: "frente", notes: "" });
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();
  const { confirm } = useFeedback();
  const upload = () =>
    run("u", async () => {
      if (!file) throw new Error("Selecione uma foto.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 15 MB).");
      const blob = await compressImage(file);
      const path = await backend.upload("progress-photos", `${v.date}-${Date.now()}.jpg`, blob);
      await backend.insert("progress_photos", { date: v.date, pose: v.pose, notes: v.notes.trim() || null, storage_path: path });
      setOpen(false);
      setFile(null);
      reload();
    }, "Foto salva com privacidade.");
  if (loading) return <PageLoader />;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock className="h-4 w-4 text-brand" /> Suas fotos são privadas: só você pode vê-las, a menos que autorize o compartilhamento de fotos no Perfil.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Camera className="h-4 w-4" /> Adicionar foto
        </Button>
      </Card>
      {!data?.length ? (
        <Empty icon={<Camera className="h-8 w-8" />} title="Nenhuma foto de evolução" text="Tire fotos sempre na mesma luz e posição para comparar melhor." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((p) => (
            <button key={p.id} onClick={() => setView(p)} className="text-left">
              <PhotoImg photo={p} />
              <div className="mt-1 flex items-center justify-between text-xs text-muted">
                <span>{fmtDate(p.date)}</span>
                {p.pose && <Badge>{p.pose}</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova foto de evolução">
        <div className="space-y-3">
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line p-6 text-sm text-muted hover:border-brand/40">
            <Camera className="h-6 w-6 text-brand" />
            {file ? file.name : "Selecionar ou tirar foto"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <Input type="date" value={v.date} max={today()} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} />
            </Field>
            <Field label="Posição">
              <Select value={v.pose} onChange={(e) => setV((p) => ({ ...p, pose: e.target.value }))}>
                <option value="frente">Frente</option>
                <option value="lado">Lado</option>
                <option value="costas">Costas</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
          </div>
          <Field label="Observações">
            <Input value={v.notes} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          <Button className="w-full" onClick={upload} loading={busy === "u"} disabled={!file}>
            Salvar foto
          </Button>
        </div>
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${fmtDate(view.date)}${view.pose ? ` · ${view.pose}` : ""}` : ""}>
        {view && (
          <div className="space-y-3">
            <PhotoImg photo={view} className="aspect-auto" />
            {view.notes && <p className="text-sm text-muted">{view.notes}</p>}
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: "Excluir foto?", text: "A foto será removida permanentemente.", danger: true, confirmLabel: "Excluir" }))
                  run("d", async () => {
                    await backend.removeFile("progress-photos", view.storage_path).catch(() => undefined);
                    await backend.remove("progress_photos", view.id);
                    setView(null);
                    reload();
                  }, "Foto excluída.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { PhotoImg };

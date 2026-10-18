import "./gaya.css";
import { DAERAH, type Daerah, type Gempa, type Katalog, cariDaerah, gempa, gutenbergRichter, kaliEnergi, nilaiB, perTahun, ringkas, sekitar, terbesar } from "./analisis";
import { gambarPetaBesar, gambarPetaKecil, gambarSeismo, grafikGR, grafikTahun, mag1, muatPeta, tanggal, type Peta } from "./vis";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const angka = (n: number) => n.toLocaleString("id-ID");

/* ---------- keadaan dari URL (#daerah=kota-palu&r=150) ---------- */
const hash = new URLSearchParams(location.hash.slice(1));
let pilihan: Daerah = DAERAH.find((d) => d.id === hash.get("daerah")) ?? DAERAH.find((d) => d.id === "kota-palu")!;
let radius = [100, 150, 300].includes(Number(hash.get("r"))) ? Number(hash.get("r")) : 150;
let magMin = 5;
let k: Katalog | null = null;
let peta: Peta | null = null;

function simpanHash() {
  history.replaceState(null, "", `#daerah=${pilihan.id}&r=${radius}`);
}

/* ---------- gambar ---------- */
function gambarPembuka() {
  if (!k) return;
  const th = (i: number) => new Date(k!.t[i] * 1000).getUTCFullYear();
  $("[data-total]").textContent = angka(k.n);
  $("[data-rentang]").textContent = `${th(0)}–${th(k.n - 1)}`;
  $("[data-dibangun]").textContent = tanggal(new Date(k.dibangun));
  gambarSeismo($("#seismo"), k);
}

function gambarSekitar() {
  if (!k) return;
  const daftar = sekitar(k, pilihan, radius);
  const r = ringkas(daftar);
  $("[data-nama-daerah]").innerHTML = `${esc(pilihan.nama)}<small>${esc(pilihan.prov)} · radius ${radius} km</small>`;
  const kalimat = $("[data-kalimat]");
  if (!r.terkuat) {
    kalimat.innerHTML = `Tidak ada gempa M5 ke atas yang tercatat dalam radius ${radius} km sejak 1900. ${esc(pilihan.nama)} termasuk daerah paling tenang di Indonesia, meskipun itu bukan jaminan untuk masa depan.`;
  } else {
    const t = r.terkuat;
    const kaliM5 = Math.round(kaliEnergi(t.mag, 5));
    kalimat.innerHTML =
      `Sejak 1900 tercatat <strong>${angka(r.total)} gempa M5+</strong> dalam radius ${radius} km, ${angka(r.m6)} di antaranya M6 ke atas. ` +
      `Yang terkuat <strong>M${mag1(t.mag)}</strong> pada ${tanggal(t.waktu)}, ${Math.round((t as Gempa & { jarakKeDaerah: number }).jarakKeDaerah)} km dari titik tengah ${esc(pilihan.nama)}` +
      (t.mag >= 6 ? `, melepas energi sekitar ${angka(kaliM5)} kali gempa M5.` : ".");
  }
  const ubin: [string, string, string, boolean][] = [
    ["Gempa M5+", angka(r.total), `${angka(r.sejak1970)} sejak 1970`, false],
    ["M6 ke atas", angka(r.m6), `${angka(r.m7)} di antaranya M7+`, false],
    ["Terkuat", r.terkuat ? `M${mag1(r.terkuat.mag)}` : "—", r.terkuat ? String(r.terkuat.waktu.getUTCFullYear()) : "tidak ada", true],
    ["Terakhir", r.terakhir ? `M${mag1(r.terakhir.mag)}` : "—", r.terakhir ? tanggal(r.terakhir.waktu) : "tidak ada", false],
  ];
  $("[data-ubin]").innerHTML = ubin
    .map(([label, nilai, ket, merah]) => `<li><span class="label">${label}</span><span class="angka${merah ? " merah" : ""}">${nilai}</span><span class="ket">${ket}</span></li>`)
    .join("");
  $("[data-lima]").innerHTML = daftar.length
    ? daftar
        .slice(0, 5)
        .map(
          (g, n) =>
            `<li><span class="mag">${mag1(g.mag)}</span><span class="rinci"><strong>${n + 1}. ${tanggal(g.waktu)}</strong> · ${Math.round(g.jarakKeDaerah)} km dari titik tengah · ${g.dalam < 0 ? "kedalaman tidak tercatat" : `kedalaman ${g.dalam} km`}</span></li>`,
        )
        .join("")
    : `<li class="kosong">Tidak ada.</li>`;
  if (peta) gambarPetaKecil($("#peta-kecil"), peta, pilihan, radius, daftar);
  $$<HTMLButtonElement>("[data-radius]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.radius) === radius)));
  masuk.value = pilihan.nama;
}

function gambarPeta() {
  if (!k || !peta) return;
  gambarPetaBesar($("#peta-besar"), peta, k, magMin);
  const n = k.mag.filter((m) => m >= magMin).length;
  $("[data-catatan-peta]").textContent = `${angka(n)} gempa M${magMin}+ ditampilkan. Arahkan kursor ke titik untuk melihat rinciannya.`;
  $$<HTMLButtonElement>("[data-magmin]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.magmin) === magMin)));
}

function gambarTerbesar() {
  if (!k) return;
  $("[data-terbesar]").innerHTML = terbesar(k, 10)
    .map((i) => {
      const g = gempa(k!, i);
      const nama = k!.tempat[String(i)];
      return `<li><span class="mag">${mag1(g.mag)}</span><span class="rinci"><strong>${tanggal(g.waktu)}</strong> · ${g.jarak} km dari ${esc(g.daerah.nama)}, ${esc(g.daerah.prov)}${nama ? `<span class="nama-usgs">${esc(nama)}</span>` : ""}</span></li>`;
    })
    .join("");
}

function gambarGrafik() {
  if (!k) return;
  const gr = gutenbergRichter(k, 1990);
  const b = nilaiB(gr.filter((x) => x.m <= 7.5));
  const n = (m: number) => gr.find((x) => x.m === m)?.n ?? 0;
  $("[data-pengantar-gr]").innerHTML =
    `Sejak 1990 (saat katalog sudah cukup lengkap) tercatat ${angka(n(5))} gempa M5+, tetapi hanya ${angka(n(7))} yang M7+. ` +
    `Tiap naik satu magnitudo, jumlahnya kira-kira <strong>${Math.round(10 ** b)} kali lebih sedikit</strong> (nilai b = ${b.toFixed(2).replace(".", ",")}), ` +
    `sementara energinya sekitar 32 kali lebih besar.`;
  $("#grafik-gr").setAttribute("aria-label", `Jumlah gempa sejak 1990 per magnitudo minimum: ${gr.map((x) => `≥${mag1(x.m)}: ${x.n}`).join(", ")}`);
  grafikGR($("#grafik-gr"), gr);
  const pt = perTahun(k);
  $("#grafik-tahun").setAttribute("aria-label", "Jumlah gempa M5+ per tahun sejak 1900");
  grafikTahun($("#grafik-tahun"), pt);
}

function gambarSemua() {
  gambarPembuka();
  gambarSekitar();
  gambarPeta();
  gambarTerbesar();
  gambarGrafik();
}

/* ---------- combobox daerah ---------- */
const masuk = $<HTMLInputElement>("#daerah");
const daftarSaran = $<HTMLUListElement>("#saran");
let saran: Daerah[] = [];
let aktif = -1;

function tutupSaran() {
  daftarSaran.hidden = true;
  masuk.setAttribute("aria-expanded", "false");
  masuk.removeAttribute("aria-activedescendant");
}
function sorot() {
  $$("#saran [role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === aktif)));
  if (aktif >= 0) masuk.setAttribute("aria-activedescendant", `saran-${aktif}`);
}
function pilih(d: Daerah) {
  pilihan = d;
  tutupSaran();
  simpanHash();
  gambarSekitar();
}
masuk.addEventListener("focus", () => masuk.select());
masuk.addEventListener("input", () => {
  saran = cariDaerah(masuk.value);
  aktif = saran.length ? 0 : -1;
  daftarSaran.innerHTML = saran.length
    ? saran.map((d, i) => `<li role="option" id="saran-${i}" data-i="${i}" aria-selected="${i === aktif}"><span>${esc(d.nama)}</span><small>${esc(d.prov)}</small></li>`).join("")
    : `<li aria-disabled="true">Tidak ada yang cocok</li>`;
  daftarSaran.hidden = !masuk.value.trim();
  masuk.setAttribute("aria-expanded", String(!daftarSaran.hidden));
  sorot();
});
masuk.addEventListener("keydown", (e) => {
  if (daftarSaran.hidden || !saran.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    aktif = (aktif + (e.key === "ArrowDown" ? 1 : -1) + saran.length) % saran.length;
    sorot();
    e.preventDefault();
  } else if (e.key === "Escape") tutupSaran();
});
masuk.addEventListener("blur", () =>
  setTimeout(() => {
    tutupSaran();
    masuk.value = pilihan.nama;
  }, 150),
);
daftarSaran.addEventListener("mousedown", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
  if (!li) return;
  e.preventDefault();
  pilih(saran[Number(li.dataset.i)]);
  masuk.blur();
});
$("#cari").addEventListener("submit", (e) => {
  e.preventDefault();
  if (aktif >= 0 && saran[aktif]) {
    pilih(saran[aktif]);
    masuk.blur();
  }
});
$$<HTMLButtonElement>("[data-radius]").forEach((b) =>
  b.addEventListener("click", () => {
    radius = Number(b.dataset.radius);
    simpanHash();
    gambarSekitar();
  }),
);
$$<HTMLButtonElement>("[data-magmin]").forEach((b) =>
  b.addEventListener("click", () => {
    magMin = Number(b.dataset.magmin);
    gambarPeta();
  }),
);

/* ---------- ukuran layar ---------- */
let lebarTerakhir = 0;
let tunda = 0;
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width);
  if (!lebarTerakhir) {
    lebarTerakhir = w;
    return;
  }
  if (w === lebarTerakhir) return;
  lebarTerakhir = w;
  cancelAnimationFrame(tunda);
  tunda = requestAnimationFrame(gambarSemua);
}).observe(document.querySelector("main")!);

/* ---------- mulai ---------- */
Promise.all([fetch(`${import.meta.env.BASE_URL}data/gempa.json`).then((r) => r.json() as Promise<Katalog>), muatPeta()])
  .then(([katalog, p]) => {
    k = katalog;
    peta = p;
    gambarSemua();
  })
  .catch(() => {
    $("#seismo").innerHTML = `<p style="padding:20px;font:13px var(--mono)">Data gempa gagal dimuat. Muat ulang halaman.</p>`;
  });

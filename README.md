To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

open http://localhost:3000

---

## Aturan dan Perhitungan Komisi Sales & Manager

### 1. Dasar Pengenaan Komisi & Penalti (Base Commission)

- **Commission Basis**: Jika tipe referral pelanggan adalah `Cashback` atau `Monthly`, dasar pengenaan komisi adalah `DPP - Referral Fee`. Selain dari tipe itu, dasar komisi dihitung full dari `DPP`.
- **Penalti Persentase (Percentage Deductions)**: Dasar Komisi dikurangi oleh penalti berikut sebelum dikalikan rate komisi:
  1. **Late Payment Penalty (Keterlambatan Pelunasan)**:
     - Berlaku untuk **semua jenis invoice** (New, Recurring, Upgrade, Prorate, dll).
     - Potongan **10% per bulan** keterlambatan (`late_month`), maksimal **50%**.
     - **Pengecualian**: Penalti ini **TIDAK BERLAKU** jika invoice ditandai sebagai disetujui (`is_approved == true`) di database.
  2. **Performance Penalty (Gagal Target Aktivitas)**:
     - Berlaku khusus untuk pegawai berstatus **Permanent** pada layanan tipe **New** (Pemasangan Baru).
     - Jika Activity Count < 12, maka dikenakan penalti sebesar **70%** (Sales hanya mendapatkan komisi dari 30% Dasar Komisi).
     - **Pengecualian**: Produk tipe **Prorate**, **Upgrade**, dan **Recurring** dibebaskan dari penalti performa ini (langsung mengambil Dasar Komisi tanpa potongan 70%).
- **Base Commission (Dasar Komisi Akhir)**: Dihitung dengan rumus:
  `Base Commission = Commission Basis * (1 - Total Persentase Penalti)`.

### 2. Aturan Komisi Sales

**A. Kategori Layanan "Home"**

- **Prorate (Prorata)**: Komisi flat **10%** dari Base Commission.
- **Upgrade**: Komisi berdasarkan rate `Service ID` dan durasi kontrak. Bebas dari penalti performa 70%.
- **Recurring (Langganan Berulang)**:
  - Bebas dari penalti performa 70%.
  - Persentase Komisi:
    - **0.5%**: Jika Sales berstatus **Permanent** dan gagal target (< 12 activity).
    - **1.5%**: Jika Sales berstatus **Probation** ATAU Sales Permanent yang **capai target** (>= 12 activity).
- **New (Pemasangan Baru)**: Persentase komisi ditentukan dari `Service ID` dan lama masa kontrak (`months`). Dikenakan penalti performa 70% jika Sales Permanent gagal target.

**Tabel Rate Komisi (New & Upgrade):**

- **Nusafiber (BFLITE)**: 1 bln (28.38%), 6 bln (6.55%), 12 bln (5.09%)
- **NusaFiber (NFSP030, NFSP100)**: < 6 bln (20.00%), 6 bln (5.56%), 12 bln (4.44%)
- **NusaFiber (NFSP200)**: < 6 bln (26.00%), 6 bln (6.00%), 12 bln (4.67%)
- **Home100, HomeSTD100**: 1 bln (28.57%), 6 bln (5.95%), 12 bln (4.76%)
- **HomeADV200, HomeADV**: 1 bln (27.78%), 6 bln (5.56%), 12 bln (4.63%)
- **HomePrem300**: 1 bln (31.25%), 6 bln (6.25%), 12 bln (5.21%)

**B. Kategori Layanan Lainnya ("Setup" & "Alat")**

- **Setup**: Komisi flat **5%**.
- **Alat**:
  - Jika pembelian alat dibundel bersamaan dengan Setup pemasangan pelanggan: komisi **2%**.
  - Jika pembelian alat tersendiri (standalone): komisi **1%**.

_Total Pembayaran Komisi Sales (per item) = `Base Commission` x `Persentase Komisi` / 100._

---

### 3. Perhitungan Activity Count (Net Activity)

Pencapaian "Activity Count" didasarkan khusus pada produk tipe baru (New) setelah dikurangi **Churn**.

- **Gross Count**:
  - Layanan standar: 1 Pelanggan Baru = 1 Activity Count.
  - Layanan **NusaSelecta (selain NFSP200)**: 2 Pelanggan Baru = 1 Activity Count (Dihitung per pasang).
- **Deduction (Churn)**:
  - Setiap pelanggan yang berhenti berlangganan (Churn) dan tidak disetujui pembatalannya akan **mengurangi** Activity Count bulan berjalan.
- **Activity Count (Net)**: `Gross Count - Churn Count`. Hasil inilah yang menentukan Achievement Goal dan Rate Recurring.

---

### 4. Churn & Deductions

Setiap record Churn yang masuk (dan bukan `is_approved`) akan mengurangi total pendapatan sales pada periode tersebut:

- **Count**: Mengurangi Activity Count (mempengaruhi target).
- **MRC**: Mengurangi total MRC bulanan.
- **Commission**: Mengurangi total komisi (Dihitung setara rate 'New' pada target 12).
- **Subscription (DPP)**: Mengurangi total volume penjualan (DPP).

---

### 5. Level Prestasi (Achievement) & Skema Bonus Sales

**A. Status Pegawai Permanent**

- `>= 15 aktivitas` : **Capai target Bonus** _("Congratulations on your outstanding achievement!")_
- `12 - 14 aktivitas` : **Capai target** _("Bravo! Keep up the great work!")_
- `3 - 11 aktivitas` : **Tidak Capai target** _("Just a little more fights, go on!")_
- `< 3 aktivitas` : **SP1** _("Keep fighting and don't give up!")_

**B. Status Pegawai Probation / Contract**

- `>= 8 aktivitas` : **Excellent**
- `5 - 7 aktivitas` : **Very Good**
- `3 - 4 aktivitas` : **Average**
- `< 3 aktivitas` : **Below Average**

**C. Skema Bonus Uang Tambahan (Dibayarkan dari total Activity Count bulanan)**

- `Activity Count > 20` : **Rp 1.500.000** + _(Setiap kelipatan di atas 20 dinilai ekstra Rp 150.000)_
- `Activity Count = 20` : **Rp 1.500.000**
- `Activity Count 17 - 19` : **Rp 1.000.000**
- `Activity Count 15 - 16` : **Rp 500.000**
- `Activity Count < 15` : Tidak ada bonus pendanaan bulanan ekstra.

---

### 6. Komisi & Performa Manager Area

**A. Persentase Performa Bulanan Manager (Achievement Percentage)**

- **Target Total Tim** = `Jumlah Pegawai Permanent Tim x 12 (karena minimal aktivitas adalah 12)`.
- **Persentase Capaian** = `(Total Activity Semua Anggota Tim / Target Total Tim) x 100%`.
- Jika tidak ada pegawai Permanent satupun dalam tim: Target dianggap 100% (kalau ada tim probation) atau 0% (kalau tim kosong).

**B. Ambang Batas Target Tim (Target Threshold)**
Status "Capai Target" Manager bersifat dinamis mengikuti total anggota tim di bawah binaannya:

- Bawahan 1 orang = Target **120%** minimum
- Bawahan 2 orang = Target **115%** minimum
- ...
- Bawahan 5 orang = Target **100%** minimum
- ...
- Bawahan >= 10 orang = Target hanya **85%** minimum

**C. Komisi New (Akuisisi Pelanggan Baru dari Tim)**
Manager mengambil komisi overriding yang diproses dari total "New Commission" uang pegawainya sebulan, dipotong berdasarkan capaian target:

- Jika Capaian `>= 150%` = Manager dikalikan **60%** dari kue New Commission.
- Jika Capaian `>= 125%` = Manager dikalikan **50%**.
- Jika Capaian `>= 100%` = Manager dikalikan **40%**.
- Jika Capaian `>= 50%` = Manager dikalikan **25%**.
- Jika Capaian `< 50%` = Manager mendapatkan **0%** bagian dari produk New.

**D. Komisi Recurring (Pemasukan Berulang dari Tim)**
Dihitung flat bulanan sebagai overriding insentif pendapatan pasif:

- Apabila Manager berstatus **Capai Target**, Rate Recurring Manager adalah **0.90%** dari total uang _Recurring Subscription_ timnya.
- Apabila Manager berstatus **Tidak Capai Target**, Rate Recurring diturunkan menjadi **0.50%** dari total pengumpulan langganan anggota timnya.

_Total Komisi Manager akhir bulan = `Total Overriding Komisi New` + `Komisi Overriding Recurring`._
_Semua perhitungan Manager menggunakan angka **NET** (setelah dikurangi churn dan penalti masing-masing anggota tim)._

---

## Alur Sistem Crawler Data (Data Crawl Flow)

Sistem komisi sangat bergantung pada penarikan data (Crawl) secara berkala (misal via scheduler atau manual trigger pada script `src/crawl/crawl.ts`). Alur ini terbagi menjadi dua sub-proses utama: penarikan _Invoice_ (Snapshot) dan _Employee_ (Hierarchy Pegawai).

### 1. Tagihan Pelanggan (Snapshot Crawl)

Proses ini berjalan pada (`src/crawl/snapshot.crawl.ts`) untuk memotret "snapshot" atau bukti penagihan dari sistem invoice terpusat berdasarkan rentang bulan berjalan (tanggal 26 s.d 25 bulan berikutnya).

- **Fetch Data Tagihan**: Sistem mengambil tagihan-tagihan untuk rentang periode bulan yang dimaksud.
- **Klasifikasi Kategori `Home`**: Untuk layanan tipe "Home", sistem akan melangkah ke proses identifikasi:
  - Jika pelanggan adalah `is_prorate == 1`, maka dicatat sebagai produk **Prorate**.
  - Jika pelanggan adalah `is_upgrade == 1`, dicatat sebagai produk **Upgrade** lalu dihitung _MRC_ nya (`dpp / bulan`).
  - Jika pelanggan adalah pesanan perpanjangan / siklus berulang (`counter > 1`) dan tagihan produk baru adalah nol (`new_subscription == 0.00`), dicatat murni sebagai **Recurring**.
  - Sisa jenis transaksi lainnya baru dianggap sah sebagai penjualan pelanggan baru (**New**) lalu dicatat besaran _MRC_ nya (`dpp / bulan`).
- **Perhitungan Penalti Keterlambatan (`late_month`)**: Sistem membandingkan Tanggal Jatuh Tempo (`invoice_due_date`) dengan Tanggal Lunas (`paid_date`). Keterlambatan akan dikonversi ke bulan di mana 30 hari penuh mewakili 1 bulan keterlambatan. Jika dibayar lebih awal/tepat hari (0 hari) diproses tanpa denda penalti.
- **Penyimpanan Replika**: Transaksi yang berhasil diklasifikasi lalu di-insert sekaligus dan dicatat log penyimpanannya pada Database komisi lokal.

### 2. Hierarki Pegawai (Employee Crawl)

Proses ini berjalan pada (`src/crawl/employee.crawl.ts`) dan menunjang keabsahan _target komisi dan besaran tier persentase_:

- **Sinkronisasi Endpoint Eksternal**: Sistem memanggil API dari layanan SDM (Nusawork) untuk mengambil data terbaru dari Pegawai level _Sales_ maupun level pendukung _Admin_.
- **Catatan Historis Kontrak Pegawai**: Seluruh pegawai akan di-insert, dan untuk Sales diberikan log _Status Period (Permanent, Probation, Contract, dll)_ atas periode berjalan tersebut. Hal ini guna memastikan jika ada karyawan kontrak yang promosi (menjadi permanen) di bulan depan, perhitungan komisi di masa periode komisi ini tidak berubah dan tetap mengacu pada _status kontrak saat periode berjalan tersebut_.

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
- **Penalti Persentase (Percentage Deductions)**: Terdapat dua penalti utama yang mengurangi Dasar Komisi sebelum dikalikan persentase rate komisi:
  1. **Late Month Penalty (Keterlambatan Bayar)**: 10% per bulan keterlambatan (`late_month`), maksimal **50%** (jika terlambat >= 5 bulan).
  2. **Low Activity Penalty (Gagal Target)**: Khusus Sales berstatus **Permanent** pada layanan **New**, jika Activity Count < 12, maka dikenakan penalti sebesar **70%** (Ambil 30% dari DPP).
- **Base Commission (Dasar Komisi Akhir)**: Dihitung dengan rumus:
  `Base Commission = Commission Basis * (1 - Total Persentase Penalti)`.
  _Contoh: Jika Sales Permanent gagal target (70%) dan pelanggan telat bayar 2 bulan (20%), maka total penalti adalah 90%. Base Commission = Basis _ 0.1.\*

### 2. Aturan Komisi Sales

**A. Kategori Layanan "Home"**

- **Prorate (Prorata)**: Komisi flat **10%**.
- **Recurring (Langganan Berulang)**:
  - Mendapatkan **1.5%** dari Effective DPP.
  - _Pengecualian_: Jika Sales berstatus **Permanent** dan pencapaian target aktivitasnya lambat (< 12 activity count), komisi diturunkan menjadi **0.5%**.
- **Upgrade & New (Baru)**: Persentase komisi ditentukan dari `Service ID` dan lama masa kontrak (`months`):
  - **Nusafiber (BFLITE)**: Kontrak 1 bln (28.38%), >= 6 bln (6.55%), >= 12 bln (5.09%)
  - **Home100, HomeSTD100**: Kontrak 1 bln (28.57%), >= 6 bln (5.95%), >= 12 bln (4.76%)
  - **HomeADV200, HomeADV**: Kontrak 1 bln (27.78%), >= 6 bln (5.56%), >= 12 bln (4.63%)
  - **HomePrem300**: Kontrak 1 bln (31.25%), >= 6 bln (6.25%), >= 12 bln (5.21%)
  - **NusaSelecta (NFSP030, NFSP100)**: Kontrak < 6 bln (20.00%), >= 6 bln (5.56%), >= 12 bln (4.44%)
  - **NusaSelecta (NFSP200)**: Kontrak < 6 bln (26.00%), >= 6 bln (6.00%), >= 12 bln (4.67%)
  - _Note_: Penalti 30% untuk Sales Permanent dengan Activity < 12 sudah dihitung pada **Base Commission** (Point 1).

**B. Kategori Layanan Lainnya ("Setup" & "Alat")**

- **Setup**: Komisi flat **5%**.
- **Alat**:
  - Jika pembelian alat dibundel bersamaan dengan Setup pemasangan pelanggan: komisi **2%**.
  - Jika pembelian alat tersendiri (standalone): komisi **1%**.

_Total Pembayaran Komisi Sales (per item) = `Base Commission` x `Persentase Komisi` / 100._

---

### 3. Perhitungan Activity Count (Pencapaian Aktivitas Penjualan Baru)

Pencapaian "Activity Count" didasarkan khusus pada produk tipe baru (New).

- Layanan standar: 1 Pelanggan Baru = 1 Activity Count.
- Layanan **NusaSelecta (selain NFSP200)**: Dihitung secara pasang. Setengah pelanggan dibulatkan ke bawah. Artinya **2 Pelanggan Baru = 1 Activity Count**.

---

### 4. Level Prestasi (Achievement) & Skema Bonus Sales

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

### 5. Komisi & Performa Manager Area

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

# Backend Survei Konversasional

Repositori ini berisi kode sumber untuk layanan backend dari aplikasi Survei Konversasional. Sistem ini dirancang untuk menyajikan survei kepada pengguna secara dinamis dan interaktif, layaknya sebuah percakapan. Backend ini mengelola alur survei, otentikasi pengguna, penyimpanan data, serta analisis respons.

## ✨ Fitur Utama

- **Alur Survei Dinamis**: Pertanyaan disajikan satu per satu, dengan logika percabangan (skipping logic) yang kompleks berdasarkan jawaban pengguna sebelumnya.
- **Otentikasi & Manajemen Sesi**: Menggunakan JWT (JSON Web Tokens) untuk mengamankan endpoint dan mengelola sesi survei per pengguna.
- **Kalkulasi Progres Akurat**: Menghitung progres penyelesaian survei secara akurat dengan memperhitungkan pertanyaan yang dilewati (skipped) dan yang tidak berlaku (N/A).
- **Manajemen Data**: Terhubung dengan database MongoDB untuk menyimpan data pengguna, sesi survei, dan jawaban.
- **Evaluasi Hasil Survei**: Menyediakan modul untuk mengevaluasi hasil survei yang telah diselesaikan oleh pengguna.
- **Integrasi AI (LangChain)**: Memanfaatkan kemampuan model bahasa (LLM) melalui LangChain untuk fitur-fitur pemrosesan bahasa alami di masa depan.
- **Logging dan Monitoring**: Dilengkapi dengan `morgan` untuk logging permintaan HTTP, membantu dalam proses debugging.

## 🛠️ Teknologi yang Digunakan

- **Runtime**: Node.js
- **Bahasa**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB dengan Mongoose ODM
- **Otentikasi**: JSON Web Token (JWT)
- **Validasi**: Zod
- **Testing**: Jest & ts-jest
- **AI/LLM**: LangChain, Google Gemini
- **Lainnya**: Helmet (keamanan), Cors (CORS handling), dotenv (environment variables), bcryptjs (hashing password).

## 🚀 Instalasi dan Menjalankan Proyek

Untuk menjalankan proyek ini secara lokal, ikuti langkah-langkah berikut:

### 1. Prasyarat

- [Node.js](https://nodejs.org/) (versi 18 atau lebih tinggi)
- [NPM](https://www.npmjs.com/) atau [Yarn](https://yarnpkg.com/)
- Akses ke instance [MongoDB](https://www.mongodb.com/)

### 2. Clone Repositori

```bash
git clone https://github.com/your-username/backend-conversational-survey.git
cd backend-conversational-survey
```

### 3. Instal Dependensi

```bash
npm install
```

### 4. Konfigurasi Environment

Buat file `.env` di direktori root proyek dengan menyalin dari `.env.example` (jika ada) atau membuatnya dari awal. Isi variabel yang dibutuhkan:

```env
# Konfigurasi Server
PORT=3000

# Koneksi Database
MONGO_URI=mongodb://user:password@host:port/database_name

# Konfigurasi Otentikasi
JWT_SECRET=rahasia_super_aman_untuk_jwt
JWT_EXPIRES_IN=1d

# Kunci API untuk Layanan Eksternal
GEMINI_API_KEY=kunci_api_google_gemini_anda
```

### 5. Menjalankan Aplikasi

- **Mode Pengembangan (dengan auto-reload):**
  ```bash
  npm run dev
  ```
  Server akan berjalan di `http://localhost:3000` dan otomatis me-restart jika ada perubahan pada kode.

- **Mode Produksi:**
  Pertama, build kode TypeScript menjadi JavaScript:
  ```bash
  npm run build
  ```
  Kemudian, jalankan aplikasi yang sudah di-build:
  ```bash
  npm start
  ```

### 6. Menjalankan Tes

Untuk memastikan semua fungsi berjalan dengan baik, jalankan unit test:

```bash
npm test
```

## API Endpoints

Proyek ini menyediakan beberapa endpoint utama untuk fungsionalitas survei dan evaluasi. Semua endpoint memerlukan otentikasi (token JWT).

- `POST /api/auth/register`: Registrasi pengguna baru.
- `POST /api/auth/login`: Login pengguna.
- `GET /api/survey/start`: Memulai sesi survei baru.
- `POST /api/survey/answer`: Mengirimkan jawaban untuk pertanyaan saat ini.
- `GET /api/survey/progress/:session_id`: Mendapatkan progres survei.
- `GET /api/survey/accurate-progress/:session_id`: Mendapatkan kalkulasi progres yang lebih akurat.
- `POST /api/evaluation/initialize`: Memulai sesi evaluasi baru berdasarkan hasil survei.

*Untuk detail lengkap mengenai request body dan response, silakan merujuk ke kode di direktori `src/routes`.*

## 🏛️ Struktur Proyek

```
src/
├── app.ts                # Entry point aplikasi Express
├── config/               # Konfigurasi (misal: database)
├── controllers/          # Logika untuk menangani request dan response
├── middlewares/          # Middleware Express (misal: otentikasi)
├── models/               # Skema data Mongoose
├── routes/               # Definisi endpoint API
├── services/             # Logika bisnis utama
└── utils/                # Fungsi-fungsi bantuan
```

## 📄 Lisensi

Proyek ini dilisensikan di bawah Lisensi [ISC](LICENSE).
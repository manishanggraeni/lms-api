import express from "express";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 Koneksi ke database
const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// ✅ Test endpoint
app.get("/", (req, res) => {
  res.send("API Jalan 🚀");
});

// =================================================
// 1. MURID BARU PER BULAN + DETAIL
// =================================================
app.get("/stats/murid-baru", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    const [rows] = await db.query(`
      SELECT 
        DATE_FORMAT(t.created_at, '%Y-%m') AS bulan,
        COUNT(DISTINCT u.id) AS jumlah,
        GROUP_CONCAT(u.name SEPARATOR ', ') AS nama_murid
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      JOIN model_has_roles mhr ON mhr.model_id = u.id
      WHERE 
        t.transaction_type = 1
        AND t.status = 1
        AND t.student_retention = 'N'
        AND mhr.role_id = 2
      GROUP BY bulan
      ORDER BY bulan DESC
      LIMIT ?
    `, [limit]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =================================================
// 2. DEMOGRAFI MURID AKTIF
// =================================================
app.get("/stats/demografi", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        SUM(CASE WHEN TIMESTAMPDIFF(YEAR, u.dob, CURDATE()) <= 16 THEN 1 ELSE 0 END) AS anak,
        SUM(CASE WHEN TIMESTAMPDIFF(YEAR, u.dob, CURDATE()) >= 17 THEN 1 ELSE 0 END) AS dewasa,
        SUM(CASE WHEN u.gender = 0 THEN 1 ELSE 0 END) AS laki_laki,
        SUM(CASE WHEN u.gender = 1 THEN 1 ELSE 0 END) AS perempuan,
        COUNT(*) AS total_murid_aktif
      FROM users u
      JOIN model_has_roles mhr 
        ON mhr.model_id = u.id AND mhr.role_id = 2
      WHERE 
        u.status = 1
        AND u.deleted_at IS NULL
    `);

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// =================================================
// 3. STATUS HARIAN (LOST CONTACT & TIDAK AKTIF)
// =================================================
app.get("/stats/status-harian", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const [rows] = await db.query(`
      SELECT 
        DATE(l.updated_at) AS tanggal,
        SUM(CASE WHEN l.status = 4 THEN 1 ELSE 0 END) AS lost_contact,
        SUM(CASE WHEN l.status = 2 THEN 1 ELSE 0 END) AS tidak_aktif,
        GROUP_CONCAT(u.name SEPARATOR ', ') AS nama_murid
      FROM user_change_status_logs l
      JOIN users u ON u.id = l.user_id
      GROUP BY tanggal
      ORDER BY tanggal DESC
      LIMIT ?
    `, [limit]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/sisa-pertemuan", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const lama = req.query.lama;
    const minHari = parseInt(req.query.min_hari);
    const sisa = parseInt(req.query.sisa);

    let kondisiHari = "";
    let kondisiSisa = "";

    // ================= FILTER HARI =================
    if (!isNaN(minHari)) {
      kondisiHari = `>= ${minHari}`;
    } else if (lama === "2minggu") kondisiHari = ">= 14";
    else if (lama === "1bulan") kondisiHari = ">= 30";
    else if (lama === "3bulan") kondisiHari = ">= 90";
    else if (lama === "6bulan") kondisiHari = ">= 180";

    // ================= FILTER SISA =================
    if (!isNaN(sisa)) {
      kondisiSisa = `= ${sisa}`;
    }

    const [rows] = await db.query(`
      SELECT 
        s.name AS student_name,
        s.phone AS student_phone,
        cs1.started_at,

        (TO_DAYS(NOW()) - TO_DAYS(cs1.started_at)) AS lama_tidak_mengaji,

        (
          SELECT COUNT(0)
          FROM course_schedules cs2
          JOIN courses c2 ON c2.id = cs2.course_id
          WHERE c2.student_id = s.id
            AND cs2.status <> 2
            AND cs2.status < 5
            AND cs2.deleted_at IS NULL
        ) AS sisa_pertemuan

      FROM users s

      LEFT JOIN (
        SELECT cs.student_id, cs.started_at
        FROM course_schedules cs
        INNER JOIN (
          SELECT student_id, MAX(updated_at) latest_update
          FROM course_schedules
          WHERE status = 2
          GROUP BY student_id
        ) x 
        ON x.student_id = cs.student_id 
        AND x.latest_update = cs.updated_at
      ) cs1 ON cs1.student_id = s.id

      WHERE s.status = 1
      AND EXISTS (
        SELECT 1
        FROM model_has_roles mrs
        WHERE mrs.model_id = s.id
          AND mrs.role_id = 2
      )

      ${kondisiHari ? `AND (TO_DAYS(NOW()) - TO_DAYS(cs1.started_at)) ${kondisiHari}` : ""}

      ${
        kondisiSisa
          ? `AND (
            SELECT COUNT(0)
            FROM course_schedules cs2
            JOIN courses c2 ON c2.id = cs2.course_id
            WHERE c2.student_id = s.id
              AND cs2.status <> 2
              AND cs2.status < 5
              AND cs2.deleted_at IS NULL
          ) ${kondisiSisa}`
          : ""
      }

      ORDER BY sisa_pertemuan ASC, lama_tidak_mengaji DESC
      LIMIT ?
    `, [limit]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});


// 🚀 Jalankan server
app.listen(process.env.PORT, () => {
  console.log(`Server running di port ${process.env.PORT}`);
});
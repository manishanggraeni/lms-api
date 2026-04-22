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

// ✅ Endpoint ambil data users dari DB
app.get("/users", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.name AS nama,
        TIMESTAMPDIFF(YEAR, u.dob, CURDATE()) AS usia,

        CASE 
          WHEN u.gender = 0 THEN 'laki-laki'
          WHEN u.gender = 1 THEN 'perempuan'
          ELSE 'tidak diketahui'
        END AS jenis_kelamin,

        u.created_at AS tanggal_masuk_sistem,

        (
          SELECT c.started_at
          FROM course_schedules c
          WHERE c.student_id = u.id
            AND c.deleted_at IS NULL
            AND c.status = 2
          ORDER BY c.id DESC
          LIMIT 1
        ) AS tanggal_terakhir_ngaji,

        COALESCE(
          u.phone,
          (
            SELECT p.phone
            FROM users p
            WHERE p.id = u.parent_id
            LIMIT 1
          )
        ) AS no_telfon

      FROM users u
      JOIN model_has_roles mhr 
        ON u.id = mhr.model_id

      WHERE 
        mhr.role_id = 2
        AND u.status = 1
        AND u.deleted_at IS NULL
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

app.get("/sisa-pertemuan", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const sisaMax = req.query.sisa_max;
    const nama = req.query.nama;

    let where = `
      s.status = 1
      AND EXISTS (
        SELECT 1
        FROM model_has_roles mrs
        WHERE mrs.model_id = s.id
          AND mrs.role_id = 2
      )
    `;

    if (sisaMax) {
      where += ` AND (
        SELECT COUNT(0)
        FROM course_schedules cs2
        JOIN courses c2 ON c2.id = cs2.course_id
        WHERE c2.student_id = s.id
          AND cs2.status <> 2
          AND cs2.status < 5
          AND cs2.deleted_at IS NULL
      ) <= ${sisaMax}`;
    }

    if (nama) {
      where += ` AND s.name LIKE '%${nama}%'`;
    }

    const [rows] = await db.query(`
      SELECT 
        s.name AS student_name,
        s.phone AS student_phone,
        cs1.started_at,
        (TO_DAYS(cs1.started_at) - TO_DAYS(NOW())) AS diff_days,

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

      WHERE ${where}
      ORDER BY sisa_pertemuan ASC
      LIMIT ${limit}
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/sisa-pertemuan/urgent", async (req, res) => {
  const [rows] = await db.query(`
    SELECT ...
    ORDER BY sisa_pertemuan ASC
    LIMIT 10
  `);

  res.json(rows);
});

// 🚀 Jalankan server
app.listen(process.env.PORT, () => {
  console.log(`Server running di port ${process.env.PORT}`);
});
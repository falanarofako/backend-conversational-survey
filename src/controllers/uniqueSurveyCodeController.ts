import { Request, Response } from "express";
import UniqueSurveyCode from "../models/UniqueSurveyCode";
import SurveySession from "../models/SurveySession";
import mongoose from "mongoose";
import User from "../models/User";

// Tambah satu kode unik
export const createUniqueSurveyCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nama_responden, kode_unik } = req.body;
    if (!nama_responden || !kode_unik) {
      res.status(400).json({ message: "nama_responden dan kode_unik wajib diisi" });
      return;
    }
    const exists = await UniqueSurveyCode.findOne({ kode_unik });
    if (exists) {
      res.status(409).json({ message: "Kode unik sudah terdaftar" });
      return;
    }
    const code = await UniqueSurveyCode.create({ nama_responden, kode_unik });
    res.status(201).json(code);
  } catch (err) {
    res.status(500).json({ message: "Gagal menambah kode unik", error: err });
  }
};

// Tambah banyak kode unik (bulk)
export const createManyUniqueSurveyCodes = async (req: Request, res: Response): Promise<void> => {
  try {
    const codes = req.body;
    if (!Array.isArray(codes) || codes.length === 0) {
      res.status(400).json({ message: "Body harus berupa array kode unik" });
      return;
    }
    const kodeUnikList = codes.map((c: any) => c.kode_unik);
    const existing = await UniqueSurveyCode.find({ kode_unik: { $in: kodeUnikList } });
    const existingCodes = existing.map((e) => e.kode_unik);
    const toInsert = codes.filter((c: any) => !existingCodes.includes(c.kode_unik));
    if (toInsert.length === 0) {
      res.status(409).json({ message: "Semua kode sudah terdaftar", existing: existingCodes });
      return;
    }
    let inserted = [];
    let duplicateError = false;
    try {
      inserted = await UniqueSurveyCode.insertMany(toInsert, { ordered: false });
    } catch (err: any) {
      // Tangani duplicate key error (E11000)
      if (err.code === 11000 || (err.writeErrors && err.writeErrors.some((e: any) => e.code === 11000))) {
        duplicateError = true;
        // Lanjutkan, inserted tetap berisi yang berhasil
        inserted = err.insertedDocs || [];
      } else {
        throw err;
      }
    }
    let response: any = { inserted, skipped: existingCodes };
    if (existingCodes.length > 0 || duplicateError) {
      response.message = "Beberapa kode sudah ada, hanya kode baru yang ditambahkan";
    }
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: "Gagal bulk insert kode unik", error: err });
  }
};

// Validasi kode unik
export const validateUniqueSurveyCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_unik } = req.params;
    const code = await UniqueSurveyCode.findOne({ kode_unik });
    if (!code) {
      res.status(404).json({ success: false, message: "Kode unik tidak valid" });
      return;
    }
    res.json({ success: true, data: code });
  } catch (err) {
    res.status(500).json({ message: "Gagal validasi kode unik", error: err });
  }
};

// Hapus kode unik
export const deleteUniqueSurveyCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_unik } = req.params;
    const deleted = await UniqueSurveyCode.findOneAndDelete({ kode_unik });
    if (!deleted) {
      res.status(404).json({ message: "Kode unik tidak ditemukan" });
      return;
    }
    res.json({ message: "Kode unik berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ message: "Gagal menghapus kode unik", error: err });
  }
};

// Validasi kode unik + submit ke sesi survei
export const validateAndSubmitUCODE = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kode_unik } = req.params;
    const userId = req.user?.id || req.user?._id; // pastikan middleware auth mengisi req.user
    const code = await UniqueSurveyCode.findOne({ kode_unik });
    if (!code) {
      res.status(404).json({ success: false, message: "Kode unik tidak valid" });
      return;
    }
    // Cari sesi survei aktif user
    const session = await SurveySession.findOne({ user_id: userId, status: "IN_PROGRESS" });
    if (session) {
      const idx = session.responses.findIndex((r: any) => r.question_code === "UCODE");
      if (idx !== -1) {
        session.responses[idx].valid_response = kode_unik;
      } else {
        session.responses.push({ question_code: "UCODE", valid_response: kode_unik });
      }
      await session.save();
    }
    res.json({ success: true, data: code });
  } catch (err) {
    res.status(500).json({ message: "Gagal validasi/submit kode unik", error: err });
  }
};

// Assign a unique survey code to the current user
export const assignUniqueSurveyCodeToUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { kode_unik } = req.body;
    if (!kode_unik) {
      res.status(400).json({ message: "kode_unik wajib diisi" });
      return;
    }
    // Validate code exists
    const code = await UniqueSurveyCode.findOne({ kode_unik });
    if (!code) {
      res.status(404).json({ message: "Kode unik tidak valid" });
      return;
    }
    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      { activeSurveyUniqueCode: kode_unik },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    res.json({ success: true, kode_unik });
  } catch (err) {
    res.status(500).json({ message: "Gagal assign kode unik ke user", error: err });
  }
};

// Get the current user's unique survey code
export const getUserUniqueSurveyCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan" });
      return;
    }
    res.json({ kode_unik: user.activeSurveyUniqueCode || null });
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil kode unik user", error: err });
  }
}; 
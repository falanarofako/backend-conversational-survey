import * as fs from "fs";
import * as path from "path";

interface Regency {
  code: string;
  name: string;
}

interface Province {
  name: string;
  code: string;
  regencies: Regency[];
}

const filePath = path.join(
  __dirname,
  "../data/indonesia_provinces_and_regencies.json"
);

export function getProvinces(): { code: string; name: string }[] {
  const data = fs.readFileSync(filePath, "utf-8");
  const provinces: Province[] = JSON.parse(data);
  return provinces.map((province) => ({
    code: province.code,
    name: province.name,
  }));
}

export function getRegenciesByProvinceCode(
  provinceCode: string
): Regency[] | null {
  const data = fs.readFileSync(filePath, "utf-8");
  const provinces: Province[] = JSON.parse(data);

  const province = provinces.find((p) => p.code === provinceCode);
  return province ? province.regencies : null;
}

export function getProvinceNames(): string[] {
  const data = fs.readFileSync(filePath, "utf-8");
  const provinces: Province[] = JSON.parse(data);
  return provinces.map((province) => province.name);
}

export function getRegencyNamesByProvinceCode(
  provinceCode: string
): string[] | null {
  const data = fs.readFileSync(filePath, "utf-8");
  const provinces: Province[] = JSON.parse(data);

  const province = provinces.find((p) => p.code === provinceCode);
  if (province) {
    return province.regencies.map((regency) => regency.name);
  }
  return null;
}

export function getRegencyNamesByProvinceName(
  provinceName: string
): string[] | null {
  const data = fs.readFileSync(filePath, "utf-8");
  const provinces: Province[] = JSON.parse(data);

  const province = provinces.find((p) => p.name === provinceName);
  if (province) {
    return province.regencies.map((regency) => regency.name);
  }
  return null;
}

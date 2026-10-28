// ไฟล์นี้: ค่าตัวอย่างสำรองตอนไม่มีค่าตั้งร้าน (ปัจจุบัน runtime อ่านค่าจาก shop_settings และไฟล์นี้ไม่ได้ถูกเรียกใช้)
/** Fallback values only. Runtime routing and costing reads shop_settings. */
export const DEMO_FALLBACK_SETTINGS = { deliveryStartTime: '11:30:00', deliveryDeadline: '12:30:00', maxOrdersPerRider: 3, riderSpeedKmh: 30, boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2 } as const;
// ประมาณเวลาเดินทางจากระยะทางและความเร็ว: ระยะทาง / ความเร็ว * 60 แล้วปัดขึ้นเป็นนาที (ค่าตัวอย่างสำรอง)
export function estimateTravelMinutes(distanceKm: number, speedKmh = DEMO_FALLBACK_SETTINGS.riderSpeedKmh): number { return Math.ceil((distanceKm / speedKmh) * 60); }
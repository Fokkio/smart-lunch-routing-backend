import { Router } from 'express';
import { ShopSettingsModel } from '../models/shop-settings.model';
import { validateSettings } from '../services/shop-settings-validation';
export { validateSettings } from '../services/shop-settings-validation';

export const settingsRoutes = Router();
settingsRoutes.get('/', async (_req, res, next) => {
  try { res.json(await ShopSettingsModel.get()); } catch (error) { next(error); }
});
settingsRoutes.put('/', async (req, res, next) => {
  try {
    const patch = validateSettings(req.body, await ShopSettingsModel.get());
    res.json(await ShopSettingsModel.update(patch));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Invalid') || error.message.startsWith('Unknown') || error.message.startsWith('Settings must'))) {
      res.status(400).json({ message: error.message }); return;
    }
    next(error);
  }
});

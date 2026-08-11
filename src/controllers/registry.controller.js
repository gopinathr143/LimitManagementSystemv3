export class RegistryController {
  constructor(registryService) {
    this.registryService = registryService;
  }

  get = async (req, res, next) => {
    try {
      const doc = await this.registryService.getRegistry(req.tenant.clientId);
      res.status(200).json({ success: true, data: this.registryService.toView(doc) });
    } catch (error) {
      next(error);
    }
  };

  replace = async (req, res, next) => {
    try {
      const actor = req.principal?.fingerprint ?? 'unknown';
      const doc = await this.registryService.replaceRegistry(req.tenant.clientId, req.body?.allowedDimensions, actor);
      res.status(200).json({ success: true, data: this.registryService.toView(doc) });
    } catch (error) {
      next(error);
    }
  };
}

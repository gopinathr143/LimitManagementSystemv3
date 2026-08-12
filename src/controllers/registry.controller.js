export class RegistryController {
  constructor(registryService) {
    this.registryService = registryService;
  }

  /** `?direction=OUTWARD` narrows to one direction's view; omitted returns every configured direction. */
  get = async (req, res, next) => {
    try {
      const doc = await this.registryService.getRegistryDoc(req.tenant.clientId);
      res.status(200).json({ success: true, data: this.registryService.toView(doc, req.query.direction) });
    } catch (error) {
      next(error);
    }
  };

  /** STORY-08-03/08-05 — `direction` is a required body field: which direction's dimension list this PUT replaces. */
  replace = async (req, res, next) => {
    try {
      const doc = await this.registryService.replaceRegistry(req.tenant.clientId, req.body?.direction, req.body?.allowedDimensions, req.actor);
      res.status(200).json({ success: true, data: this.registryService.toView(doc, req.body?.direction) });
    } catch (error) {
      next(error);
    }
  };
}

/** STORY-02-05 — a create/update response carries a non-blocking warning when the definition isn't currently enforced. */
function toResponsePayload(definitionWithEffectiveness) {
  const { effective, effectivenessReason, effectivenessMessage, ...definition } = definitionWithEffectiveness;
  return {
    data: { ...definition, effective },
    warnings: effective ? [] : [{ code: effectivenessReason, message: effectivenessMessage }],
  };
}

export class LimitDefinitionController {
  constructor(limitDefinitionService) {
    this.limitDefinitionService = limitDefinitionService;
  }

  create = async (req, res, next) => {
    try {
      const actor = req.principal?.fingerprint ?? 'unknown';
      const result = await this.limitDefinitionService.createDefinition(req.tenant.clientId, req.body, actor);
      const { data, warnings } = toResponsePayload(result);
      res.status(201).json({ success: true, data, warnings });
    } catch (error) {
      next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      const { dimensionCode, windowType } = req.query;
      const results = await this.limitDefinitionService.listDefinitions(req.tenant.clientId, { dimensionCode, windowType });
      res.status(200).json({ success: true, data: results.map((r) => toResponsePayload(r).data) });
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      const result = await this.limitDefinitionService.getDefinition(req.tenant.clientId, req.params.id);
      res.status(200).json({ success: true, data: toResponsePayload(result).data });
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const actor = req.principal?.fingerprint ?? 'unknown';
      const result = await this.limitDefinitionService.updateDefinition(req.tenant.clientId, req.params.id, req.body, actor);
      const { data, warnings } = toResponsePayload(result);
      res.status(200).json({ success: true, data, warnings });
    } catch (error) {
      next(error);
    }
  };

  deactivate = async (req, res, next) => {
    try {
      const actor = req.principal?.fingerprint ?? 'unknown';
      const result = await this.limitDefinitionService.deactivateDefinition(req.tenant.clientId, req.params.id, actor);
      res.status(200).json({ success: true, data: toResponsePayload(result).data });
    } catch (error) {
      next(error);
    }
  };
}

export class ClientController {
  constructor(clientService) {
    this.clientService = clientService;
  }

  create = async (req, res, next) => {
    try {
      const { client } = await this.clientService.createClient(req.body, req.actor);
      res.status(201).json({ success: true, data: { client } });
    } catch (error) {
      next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      const skip = Number(req.query.skip ?? 0);
      const clients = await this.clientService.listClients({ limit, skip });
      res.status(200).json({ success: true, data: clients });
    } catch (error) {
      next(error);
    }
  };

  getByClientId = async (req, res, next) => {
    try {
      const client = await this.clientService.getClient(req.params.clientId);
      res.status(200).json({ success: true, data: client });
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const result = await this.clientService.updateClient(req.params.clientId, req.body, req.actor);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}

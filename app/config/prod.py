from .default import DefaultConfig


class ProdConfig(DefaultConfig):
    DEBUG = False


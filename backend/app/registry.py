import logging
from typing import Dict, Any, List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class ProviderInfo(BaseModel):
    organization: str = "nayana.ai"
    url: str = "https://nayana.ai"

class Capabilities(BaseModel):
    streaming: bool = True
    pushNotifications: bool = False
    stateTransitionHistory: bool = True
    chat_agent: bool = False

class AgentCard(BaseModel):
    protocolVersion: str = "0.2.9"
    name: str
    description: str
    url: str = "http://localhost:8000/"
    preferredTransport: str = "JSONRPC"
    provider: ProviderInfo = ProviderInfo()
    iconUrl: str = "http://localhost:8000/icon.png"
    version: str = "1.0.0"
    documentationUrl: str = "http://localhost:8000/docs"
    capabilities: Capabilities = Capabilities()
    securitySchemes: Dict[str, Any] = {}
    security: List[Any] = []
    defaultInputModes: List[str] = ["text/plain"]
    defaultOutputModes: List[str] = ["text/plain"]

class AgentRegistry:
    def __init__(self):
        self.registry: Dict[str, AgentCard] = {}
        self._pre_register_agents()

    def _pre_register_agents(self):
        self.register_agent(
            "IngestionAgent",
            AgentCard(
                name="IngestionAgent",
                description="Scrapes, structures and crawls landing pages and developer documentation.",
            )
        )
        self.register_agent(
            "UserIntentAgent",
            AgentCard(
                name="UserIntentAgent",
                description="Generates lists of high-probability questions representing user intent.",
            )
        )
        self.register_agent(
            "EvaluationAgent",
            AgentCard(
                name="EvaluationAgent",
                description="Simulates answer generation and ranks outputs on trust, hallucination and gaps.",
            )
        )
        self.register_agent(
            "CompetitorAgent",
            AgentCard(
                name="CompetitorAgent",
                description="Evaluates competitive domains side-by-side on answer engine metrics.",
            )
        )
        self.register_agent(
            "ContentGapAgent",
            AgentCard(
                name="ContentGapAgent",
                description="Diagnoses semantic formatting issues (JSON-LD, structured schemas).",
            )
        )
        self.register_agent(
            "RemediationAgent",
            AgentCard(
                name="RemediationAgent",
                description="Generates local codebase patches to resolve missing documentation context and schemas.",
            )
        )

    def register_agent(self, agent_id: str, card: AgentCard):
        self.registry[agent_id] = card
        logger.info(f"Registered agent card: {agent_id}")

    def get_agent_card(self, agent_id: str) -> AgentCard:
        return self.registry.get(agent_id)

    def list_agents(self) -> List[AgentCard]:
        return list(self.registry.values())

package tr.borsatakip.v5.data

enum class ProviderFailureCode {
    NONE,
    BACKEND_URL_MISSING,
    API_KEY_MISSING,
    INVALID_HTTPS,
    TLS_ERROR,
    HEALTH_ERROR,
    AUTH_ERROR,
    BIST_SYMBOLS_ERROR,
    BIST_QUOTE_ERROR,
    BIST_HISTORY_ERROR,
    VIOP_CONTRACTS_ERROR,
    VIOP_QUOTE_ERROR,
    VIOP_HISTORY_ERROR,
    STALE_DATA,
    RATE_LIMIT,
    API_ROUTE_NOT_FOUND,
    SERVER_ERROR,
    DATA_SOURCE_NOT_CONNECTED,
    NETWORK_ERROR,
    DNS_ERROR,
    NETWORK_TIMEOUT,
    EMPTY_DATA,
    UNKNOWN_ERROR
}

class ProviderException(
    val code: ProviderFailureCode,
    message: String,
    cause: Throwable? = null,
    val diagnosticCode: String = code.name,
    val connection: BackendHttpEvidence = BackendHttpEvidence()
) : Exception(message, cause)

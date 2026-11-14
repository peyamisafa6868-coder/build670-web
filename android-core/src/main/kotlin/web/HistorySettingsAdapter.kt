package tr.borsatakip.v5.data

/** Reference adapter for the three costs consumed by unchanged SignalHistoryStore. */
class SettingsStore(context: android.content.Context) {
    private val preferences = context.getSharedPreferences("web_history_costs", 0)
    val tradeSimulationQuantity: Double get() = preferences.getString("quantity", "0")!!.toDouble()
    val tradeCommissionPerSide: Double get() = preferences.getString("commission", "0")!!.toDouble()
    val tradeSlippageBpsPerSide: Double get() = preferences.getString("slippage", "0")!!.toDouble()
}

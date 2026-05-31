/**
 * Formats a number to Indian numbering system style (e.g. 1,50,000.00)
 * Falls back to manual regex parsing if Intl.NumberFormat fails.
 */
export function formatIndianCurrency(amount: number, decimalPlaces: number = 2): string {
    if (isNaN(amount) || amount === null || amount === undefined) {
        return decimalPlaces > 0 ? "0." + "0".repeat(decimalPlaces) : "0";
    }
    
    try {
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        }).format(amount);
    } catch (e) {
        const isNegative = amount < 0;
        const absAmount = Math.abs(amount);
        let x = absAmount.toFixed(decimalPlaces);
        let parts = x.split('.');
        let lastThree = parts[0].substring(parts[0].length - 3);
        let otherNumbers = parts[0].substring(0, parts[0].length - 3);
        if (otherNumbers !== '') {
            lastThree = ',' + lastThree;
        }
        let res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
        if (parts.length > 1) {
            res += "." + parts[1];
        }
        return (isNegative ? "-" : "") + res;
    }
}

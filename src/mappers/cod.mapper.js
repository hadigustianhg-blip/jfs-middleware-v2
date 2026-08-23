"use strict";

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null) ?? null;
}

function mapRepaymentType(item) {
  const rawType = item.repaymentType ?? null;
  const rawCode = firstDefined(item.repaymentTypeCode, rawType);
  const repaymentTypeCode = typeof rawCode === "number" && Number.isInteger(rawCode)
    ? rawCode
    : null;
  const rawLabel = firstDefined(
    item.repaymentTypeLabel,
    item.repaymentTypeName,
    typeof rawType === "string" ? rawType : null
  );

  return {
    repaymentType: rawType,
    repaymentTypeCode,
    repaymentTypeLabel: typeof rawLabel === "string" && rawLabel.trim()
      ? rawLabel.trim()
      : null
  };
}

module.exports = { mapRepaymentType };

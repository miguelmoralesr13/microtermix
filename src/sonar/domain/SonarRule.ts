/**
 * Domain entity representing a SonarQube rule.
 */
export interface SonarRule {
  readonly key: string;
  name: string;
  severity: string;
  type: string;
  status: string;
  langName?: string;
  htmlDesc?: string;
}

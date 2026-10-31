export const FEATURE_NAMES = ["amountRatio", "absoluteDifferenceRatio", "recentPaymentCount", "duplicateReference", "daysFromInvoice", "customerExceptionRate", "referencePresent"] as const;
export type Features = Record<(typeof FEATURE_NAMES)[number], number>;
export type ModelArtifact = { version:string; featureNames:string[]; means:number[]; scales:number[]; weights:number[]; bias:number; threshold:number; metrics:Metrics; dataset:{size:number;trainSize:number;validationSize?:number;testSize:number;seed:number;split:string}; generatedAt:string };
export type Metrics = { precision:number; recall:number; f1:number; accuracy:number; rocAuc:number; confusionMatrix:{tp:number;fp:number;tn:number;fn:number}; baselineF1:number; simpleRuleF1?:number };
export const sigmoid=(x:number)=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
export function vectorize(features:Features){ return FEATURE_NAMES.map((name)=>features[name]); }
export function score(artifact:ModelArtifact,features:Features){ const x=vectorize(features).map((v,i)=>(v-artifact.means[i])/artifact.scales[i]); return sigmoid(x.reduce((sum,v,i)=>sum+v*artifact.weights[i],artifact.bias)); }

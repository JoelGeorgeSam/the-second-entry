import artifactJson from "../../../ml/artifacts/anomaly-model.json";
import { score, type Features, type ModelArtifact } from "../../../ml/model";

const artifact=artifactJson as ModelArtifact;
export function inferAnomaly(features:Features){ const riskScore=score(artifact,features); const ranked=artifact.featureNames.map((feature,index)=>{const value=features[feature as keyof Features];const standardized=(value-artifact.means[index])/artifact.scales[index];return{feature,value,contribution:standardized*artifact.weights[index]};}).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,3); return {modelVersion:artifact.version,riskScore,threshold:artifact.threshold,isAnomaly:riskScore>=artifact.threshold,supportingIndicators:ranked,inferenceTimestamp:new Date().toISOString()}; }
export function modelArtifact(){return artifact;}

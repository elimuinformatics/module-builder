import _ from 'lodash'
import { getTemplate } from '../templates/Templates'

const initialState = {
  libraryModuleCodes: {}, // list types of nodes
  warnings: [],
  libraryRelatedModules: {},
  relatedModules: [],
  attributes: []
};

const attributes = module => {
  const attributes = [];
  Object.keys(module.states).forEach(stateName => {
    let state = module.states[stateName];
    
     if(state.type === 'SetAttribute'){
       attributes.push({attribute: state.attribute, stateName: state.name, stateType: state.type});
     } else if(state.assign_to_attribute){
       attributes.push({attribute: state.assign_to_attribute, stateName: state.name, stateType: state.type});
     }
  });

  return attributes.sort(function(a, b){
    var x = a.attribute.toLowerCase();
    var y = b.attribute.toLowerCase();
    if (x < y) {return -1;}
    if (x > y) {return 1;}
    return 0;
  })
}

const templateCodes = {};
Object.keys(getTemplate('Type').Code).map(c => getTemplate('Type').Code[c]).forEach(code => {
  templateCodes[`${code.code}-${code.system}-${code.display}`] = true;
});

const placeholderCodeWarnings = (module) => {
  const warnings = [];
  Object.keys(module.states).forEach(stateName => {
    let state = module.states[stateName];
    state.codes && state.codes.forEach(code => {
      if(templateCodes[`${code.code}-${code.system}-${code.display}`]){
        warnings.push({stateName: stateName, message: 'Code uses an invalid template code: ' + code.system + '[' + code.code + ']'});
      }
    });

    switch(state.type){
      case 'MultiObservation':
      case 'DiagnosticReport':
        if(state.observations){
          state.observations.forEach(o => {
          o.codes && o.codes.forEach(code => {
            if(templateCodes[`${code.code}-${code.system}-${code.display}`]){
              warnings.push({stateName: stateName, message: 'Code in observation uses an invalid template code: ' + code.system + '[' + code.code + ']'});
            }
          })
        })}

        break; 
      case 'ImagingStudy':
        if(state.procedure_code){
            if(templateCodes[`${state.procedure_code.code}-${state.procedure_code.system}-${state.procedure_code.display}`]){
              warnings.push({stateName: stateName, message: 'Code in procedure code uses an invalid template code: ' + state.procedure_code.system + '[' + state.procedure_code.code + ']'});
            }
        }
        if(state.series ){
          state.series.forEach(series => {
            if(series.body_site){
              if(templateCodes[`${series.body_site.code}-${series.body_site.system}-${series.body_site.display}`]){
                warnings.push({stateName: stateName, message: 'Code in imaging series uses an invalid template code: ' + series.body_site.system + '[' + series.body_site.code + ']'});
              }
            }
            if(series.modality){
              if(templateCodes[`${series.modality.code}-${series.modality.system}-${series.modality.display}`]){
                warnings.push({stateName: stateName, message: 'Code in imaging series uses an invalid template code: ' + series.modality.system + '[' + series.modality.code + ']'});
              }
            }
            if(series.instances){
              series.instances.forEach(instance => {
                if(instance.sop_class){
                  if(templateCodes[`${instance.sop_class.code}-${instance.sop_class.system}-${instance.sop_class.display}`]){
                    warnings.push({stateName: stateName, message: 'Code in imaging series uses an invalid template code: ' + instance.sop_class.system + '[' + instance.sop_class.code + ']'});
                  }
                }
              })
            }

          })

        }
        break;
      default:
        break;


    }
  })
  return warnings;

}

const stateCollisionWarnings = (module, globalCodes) => {
  const equivalentStates = [
   ['MedicationOrder', 'MedicationEnd'],
   ['ConditionOnset', 'ConditionEnd'],
   ['CarePlanStart', 'CarePlanEnd'],
   ['AllergyOnset', 'AllergyEnd'],
  ];

  const isEquivalentStates = (first, second) => {
    return (first === second || equivalentStates.filter(e => (e[0] === first && e[1] === second) || (e[0] === second && e[1] === first)).length > 0)
  }

  const checkCollision = libraryState =>  (local => !isEquivalentStates(local.state.type, libraryState.type) && local.state.type !== 'Death' && libraryState.type !== 'Death');

  const warnings = [];
  Object.keys(module.states).forEach(stateName => {
    let state = module.states[stateName];
    state.codes && state.codes.forEach(code => {

      if(globalCodes[code.code]){
        let collisions = globalCodes[code.code].filter(checkCollision(state));
        if(collisions.length > 0){
          warnings.push({stateName, message: 'Code collision with state ' + collisions[0].stateName + ' in module ' + collisions[0].moduleKey + '. '});
        }
      }
    });
  });

  return warnings;

}

const orphanStateWarnings = (module) => {
  const warnings = [];

  const visitedStateCheck = Object.keys(module.states).reduce( (acc, value) => {acc[value] = false; return acc}, {})

  const visitNext = [];

  if(module.states['Initial']){
    visitNext.push('Initial');
  };

  while(visitNext.length > 0){
    let nextStateKey = visitNext.pop();
    let nextState = module.states[nextStateKey];
    visitedStateCheck[nextStateKey] = true;

    if(nextState.direct_transition){
      if(!module.states[nextState.direct_transition]){
        warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + nextState.direct_transition});
      } else {
        if(!visitedStateCheck[nextState.direct_transition]){
          visitNext.push(nextState.direct_transition);
        }
      }
    } else if(nextState.distributed_transition){
      nextState.distributed_transition.forEach(transition => {
        if(!module.states[transition.transition]){
          warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + transition.transition});
        } else {
          if(!visitedStateCheck[transition.transition]){
            visitNext.push(transition.transition);
          }
        }
      });
    } else if(nextState.table_transition){
      nextState.table_transition.transitions.forEach(transition => {
        if(!module.states[transition.transition]){
          warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + transition.transition});
        } else {
          if(!visitedStateCheck[transition.transition]){
            visitNext.push(transition.transition);
          }
        }
      });
    } 
    else if(nextState.conditional_transition){
      nextState.conditional_transition.forEach(transition => {
        if(!module.states[transition.transition]){
          warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + transition.transition});
        } else {
          if(!visitedStateCheck[transition.transition]){
            visitNext.push(transition.transition);
          }
        }
      });
    } else if (nextState.complex_transition){
      nextState.complex_transition.forEach( transition => {
        if(transition.transition){
          if(!module.states[transition.transition]){
            warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + transition.transition});
          } else {
            if(!visitedStateCheck[transition.transition]){
              visitNext.push(transition.transition);
            }
          }
        }
        if(transition.distributions){
          transition.distributions.forEach( distribution => {
            if(!module.states[distribution.transition]){
              warnings.push({stateName: nextStateKey, message: 'Transition to state that does not exist: ' + distribution.transition});
            } else {
              if(!visitedStateCheck[distribution.transition]){
                visitNext.push(distribution.transition);
              }
            }
          })
        }
      })
    }
  }

  let notVisitedWarnings = Object.keys(visitedStateCheck).map(s => {return {state: s, visited: visitedStateCheck[s]}}).filter(v => !v.visited).map(v => {
    return {
      stateName: v.state,
      message: 'State cannot be reached.'
    };
  });

  return [...warnings, ...notVisitedWarnings];

}

const libraryModuleCodes = (modules) => {
    const libraryModuleCodes = {};

    Object.keys(modules).forEach(moduleKey => {
      const module = modules[moduleKey];
      Object.keys(module.states).forEach(stateName => {
        const moduleState = module.states[stateName];
        moduleState.codes && moduleState.codes.forEach(code => {
          if(!libraryModuleCodes[code.code]){
            libraryModuleCodes[code.code] = []
          }
          libraryModuleCodes[code.code].push({...code, moduleKey, stateName, state: moduleState});
        });
      });
    });
    return libraryModuleCodes;
}

const libraryRelatedModules = (modules) => {
  const libraryRelatedModules = {};

  Object.keys(modules).forEach(moduleKey => {
    const module = modules[moduleKey];
    Object.keys(module.states).forEach(stateName => {
      const moduleState = module.states[stateName];
      if(moduleState.type === 'CallSubmodule'){
        libraryRelatedModules[moduleKey] = libraryRelatedModules[stateName] || []
        libraryRelatedModules[moduleKey].push({type: 'submodule', moduleKey: moduleState.submodule, stateName})

        libraryRelatedModules[moduleState.submodule] = libraryRelatedModules[moduleState.submodule] || []
        libraryRelatedModules[moduleState.submodule].push({type: 'submodule', moduleKey, stateName})
      }
    });
  });
  return libraryRelatedModules;

}

const relatedBySubmodule = (moduleKey, module, relatedMap) => {
  let related = [];

  if(relatedMap[moduleKey]){
    related = _.cloneDeep(relatedMap[moduleKey]);
  }
  
  Object.keys(module.states).forEach(stateName => {
    const moduleState = module.states[stateName];
     if(moduleState.type === 'CallSubmodule'){
       related.push({type: 'submodule', module: moduleState.submodule, stateName});
     }
  });

  return related;
}

export default (state = initialState, action) => {
  let newState = {...state};
  switch (action.type) {
    case 'ANALYZE':

      newState.warnings = [...stateCollisionWarnings(action.data.module, newState.libraryModuleCodes),
                           ...orphanStateWarnings(action.data.module),
                           ...placeholderCodeWarnings(action.data.module)];

      newState.relatedModules = [...relatedBySubmodule(action.data.moduleKey, action.data.module, newState.libraryRelatedModules)];

      newState.attributes = attributes(action.data.module);

      return newState;

    case 'LOAD_LIBRARY':

      newState.libraryModuleCodes = libraryModuleCodes(action.data);
      newState.libraryRelatedModules = libraryRelatedModules(action.data);

      return newState

    default:
      return state;
  }
}

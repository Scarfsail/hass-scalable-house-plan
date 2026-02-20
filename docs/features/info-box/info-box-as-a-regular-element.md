## Current situation
We have a concept of infobox for each room. On one hand it's a regular element (info-box-shp), but it has a dedicated config section for hte whole house and then for each room. The infobox automatically shows information like temperature, humidity and so on. When infobox position specified per room, it's automatically placed there.

## Problem
It's not intuitive to find the configuration and also it differs from all other elements in the room. Also, drag and drop doesn't work as it tries to find the element in the elements list. But it has a dedicated section, so it's not there.


## Request
### Infobox configuration
Infobox should be placed in a room as any other element. When placed and configured it behaves as now.
The configuration of the infobox should be changed to match the standard pattern on all the other elements.

### The default configuration on whole house level
The overall infobox configuration should be generalized to "entity / element plan configuration defaults". When specified, it will use that configuration for the given element. So the default yaml will be array of such default configs (similar to entities array in each room). There should be always defined element type which will be used for matching. So I could then define default config for any element type like "custom:info-box-shp". The config should be exactly the same as the plan part for room entities:
    - left: 10
      top: 5
      element:
        type: custom:info-box-shp
        show_background_overview: false
    - element:
        type: custom:some-other-element
        some-default-params
        
        
The merge needs to happen for all elements, also those not explicitely in the configuration, but taken from the mapping.
       
### Migration and backward compatibility
No backward compatibility, just create me a python script which will migrate the yaml with the old info-box config to the new format, users will migrate the configuration by using that python script.
There is example of the existing configuration in origina-info-box-config.yaml file. So you could test the migration script on this file. Don't modify the original file, always create a new one.


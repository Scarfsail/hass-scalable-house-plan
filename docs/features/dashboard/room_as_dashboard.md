## Current situation
We have concept of rooms. Each roo could contain various entities. We have two main views of the room: overview and detail. 
It works great for real rooms or areas (like garden). But less for things like calendar, weather forecast, clock or various controls like alarm, electricity mode, etc.

## The need for "room as dashboard"
The idea is to be able to create a "room" that is not a real room, but rather a dashboard. We would use the same room component with extra switch "Show as dashboard" that would enable the following features:
 - The background will be rendered as a black dashboard with a glare effect, so it would be more clear that this is a dashboard, not a real room. 
 - The original bacground image will be hidden and ony the entities will be rendered on top of black, with glare effect background.
 - There will be a slim border like on a dashboard or display.
 - That background will apply to both overview and detail view. 
 - All the entities / elements arragement and behavior will be the same as for a regular room, so we can use all the existing features of the room component.
 - The "Show as dashboard" switch will be available for all rooms, but it will be up to the user to decide which room is a real room and which is a dashboard.

import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'space-selector',
  schema: {
    space1: ecs.string,
    space2: ecs.string,
    space3: ecs.string,
    space4: ecs.string,
    option1: ecs.eid,
    option2: ecs.eid,
    option3: ecs.eid,
    option4: ecs.eid,
    activeSpaceName: ecs.eid,
    option1Name: ecs.eid,
    option2Name: ecs.eid,
    option3Name: ecs.eid,
    option4Name: ecs.eid,
    option1Icon: ecs.eid,
    option2Icon: ecs.eid,
    option3Icon: ecs.eid,
    option4Icon: ecs.eid,
  },
  add: (world, component) => {
    const {
      space1, space2, space3, space4,
      option1Name, option2Name, option3Name, option4Name,
    } = component.schema

    ecs.Ui.set(world, option1Name, {text: space1})
    ecs.Ui.set(world, option2Name, {text: space2})
    ecs.Ui.set(world, option3Name, {text: space3})
    ecs.Ui.set(world, option4Name, {text: space4})
  },
  stateMachine: ({world, eid, schemaAttribute}) => {
    const spaces = ['space1', 'space2', 'space3', 'space4'] as const
    const schemaData = schemaAttribute.get(eid)
    
    const spaceMap = {
      space1: { spaceName: schemaData.space1, option: schemaData.option1, icon: schemaData.option1Icon },
      space2: { spaceName: schemaData.space2, option: schemaData.option2, icon: schemaData.option2Icon },
      space3: { spaceName: schemaData.space3, option: schemaData.option3, icon: schemaData.option3Icon },
      space4: { spaceName: schemaData.space4, option: schemaData.option4, icon: schemaData.option4Icon },
    } as const

    const otherSpaces = (current: string) => spaces.filter((s): s is typeof spaces[number] => s !== current)

    spaces.forEach((spaceName, index) => {
      const isInitial = index === 0
      const spaceData = spaceMap[spaceName as keyof typeof spaceMap]
      
      const stateBuilder = ecs.defineState(spaceName)
      
      if (isInitial) {
        stateBuilder.initial()
      }

      stateBuilder.onEnter(() => {
        world.spaces.loadSpace(spaceData.spaceName)
        ecs.Ui.set(world, schemaData.activeSpaceName, {text: spaceData.spaceName})
        ecs.Hidden.remove(world, spaceData.icon)
      })
      .onExit(() => {
        ecs.Hidden.set(world, spaceData.icon, {opacity: 0})
      })

      otherSpaces(spaceName).forEach(other => {
        stateBuilder.onEvent(ecs.input.UI_CLICK, other, {target: spaceMap[other as keyof typeof spaceMap].option})
      })
    })
  },
})
